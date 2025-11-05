/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Autodesk Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

'use strict'; // http://www.w3schools.com/js/js_strict.asp

// web framework
var express = require('express');
var router = express.Router();

var apsSDK = require('forge-apis');

// APS config information, such as client ID and secret
var config = require('../config');

var cryptiles = require('cryptiles');

// this end point will logoff the user by destroying the session
// as of now there is no APS endpoint to invalidate tokens
router.get('/user/logoff', function (req, res) {
  console.log('/user/logoff')

  req.session = null;

  res.end('/');
});

router.get('/api/aps/clientID', function (req, res) {
  res.json({
    'ClientId': config.credentials.client_id
  });
});

// return the public token of the current user
// the public token should have a limited scope (read-only)
router.get('/user/token', function (req, res) {
  console.log('Getting user token'); // debug

  // json returns empty object if the entry values are undefined
  // so let's avoid that
  var tp = req.session.public?.access_token ? req.session.public.access_token : "";
  var te = req.session.public?.expires_in ? req.session.public.expires_in : "";
  console.log('Public token:' + tp);
  res.json({token: tp, expires_in: te});
});

// return the APS authenticate url
router.get('/user/authenticate', function (req, res) {
  req.session.csrf = cryptiles.randomString(24);

  console.log('using csrf: ' + req.session.csrf);

  console.log('/user/authenticate');

  // redirect the user to this page
  var url =
    "https://developer.api.autodesk.com" +
    '/authentication/v2/authorize?response_type=code' +
    '&client_id=' + config.credentials.client_id +
    '&redirect_uri=' + config.callbackURL +
    '&state=' + req.session.csrf +
    '&scope=' + config.scopeInternal.join(" ");
  res.end(url);
});

// wait for Autodesk callback (oAuth callback)
router.get('/callback/oauth', function (req, res) {
  var csrf = req.query.state;

  console.log('stored csrf: ' + req.session.csrf);
  console.log('got back csrf: ' + csrf);

  if (!csrf || csrf !== req.session.csrf) {
    console.log('CSRF validation failed!');
    res.status(401).end();
    return;
  }

  var code = req.query.code;
  if (!code) {
    console.log('No authorization code received!');
    res.redirect('/');
    return;
  }

  console.log('Authorization code: ' + code);

  // first get a full scope token for internal use (server-side)
  var req1 = new apsSDK.AuthClientThreeLeggedV2(config.credentials.client_id, config.credentials.client_secret, config.callbackURL, config.scopeInternal);
  console.log('Getting internal token with scopes: ' + config.scopeInternal.join(', '));

  req1.getToken(code)
    .then(function (internalCredentials) {
      console.log('Successfully got internal token');

      req.session.internal = {
        access_token: internalCredentials.access_token,
        expires_in: internalCredentials.expires_in,
        refresh_token: internalCredentials.refresh_token
      }

      console.log('Internal token (full scope): ' + internalCredentials.access_token); // debug
      console.log('Internal refresh token: ' + internalCredentials.refresh_token);

      // For the public token, we'll use the internal token with viewables:read scope
      // The viewer only needs viewables:read access
      req.session.public = {
        access_token: internalCredentials.access_token,
        expires_in: internalCredentials.expires_in
      }

      console.log('Public token (using internal token): ' + internalCredentials.access_token); // debug
      console.log('Redirecting to home page');
      res.redirect('/');
    })
    .catch(function (error) {
      console.log('ERROR: Failed to get initial token');
      console.log('Error details: ' + JSON.stringify(error));
      res.status(500).end(JSON.stringify(error));
    });
});

module.exports = router;