var MyVars = {
    keepTrying: true,
    selectedViews: {}
};

$(document).ready(function () {
    //debugger;
    $('#hiddenFrame').attr('src', '');

    $("#refreshTree").click(function (evt) {
        $("#apsFiles").jstree(true).refresh()
    });

    // Get the tokens
    get3LegToken(function(token) {
        var auth = $("#authenticate");

        if (!token) {
            auth.click(signIn);
        } else {
            MyVars.token3Leg = token;

            auth.html('You\'re logged in');
            auth.click(function () {
              if (MyVars.token3Leg) {
                if (confirm("You're sure you want to log out?")) {
                    logoff();
                }
              } else {
                signIn();
              }
            });

            // Fill the tree with A360 items
            prepareFilesTree();

            // Download list of available file formats
            fillFormats();
        }
    });
});

function base64encode(str) {
    var ret = "";
    if (window.btoa) {
        ret = window.btoa(str);
    } else {
        // IE9 support
        ret = window.Base64.encode(str);
    }

    // Remove ending '=' signs
    // Use _ instead of /
    // Use - insteaqd of +
    // Have a look at this page for info on "Unpadded 'base64url' for "named information" URI's (RFC 6920)"
    // which is the format being used by the Model Derivative API
    // https://en.wikipedia.org/wiki/Base64#Variants_summary_table
    var ret2 = ret.replace(/=/g, '').replace(/[/]/g, '_').replace(/[+]/g, '-');

    console.log('base64encode result = ' + ret2);

    return ret2;
}

function signIn() {
    $.ajax({
        url: '/user/authenticate',
        success: function (rootUrl) {
            location.href = rootUrl;
        }
    });
}

function logoff() {
  // Delete session data both locally and on the server
  MyVars.token3Leg = null;
  $.ajax({
    url: '/user/logoff',
    success: function (oauthUrl) {
    }
  });

  let loadCount = 0;
  $('#hiddenFrame').on('load', function(data) {
    loadCount++;
    if (loadCount > 1) {
      // Once the logout finished the iframe will be redirected
      // and the load event will be fired again
      window.location.reload();
    }
  })

   // Load the LogOut page
   $('#hiddenFrame').attr('src', 'https://developer.api.autodesk.com/authentication/v2/logout');
}

function get3LegToken(callback) {

    if (callback) {
        $.ajax({
            url: '/user/token',
            success: function (data) {
                MyVars.token3Leg = data.token;
                console.log('Returning new 3 legged token (User Authorization): ' + MyVars.token3Leg);
                callback(data.token, data.expires_in);
            }
        });
    } else {
        console.log('Returning saved 3 legged token (User Authorization): ' + MyVars.token3Leg);

        return MyVars.token3Leg;
    }
}

// http://stackoverflow.com/questions/4068373/center-a-popup-window-on-screen
function PopupCenter(url, title, w, h) {
    // Fixes dual-screen position                         Most browsers      Firefox
    var dualScreenLeft = window.screenLeft != undefined ? window.screenLeft : screen.left;
    var dualScreenTop = window.screenTop != undefined ? window.screenTop : screen.top;

    var width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width;
    var height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height;

    var left = ((width / 2) - (w / 2)) + dualScreenLeft;
    var top = ((height / 2) - (h / 2)) + dualScreenTop;
    var newWindow = window.open(url, title, 'scrollbars=yes, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left);

    // Puts focus on the newWindow
    if (window.focus) {
        newWindow.focus();
    }
}

function downloadDerivative(urn, derUrn, fileName) {
    console.log("downloadDerivative for urn=" + urn + " and derUrn=" + derUrn);
    // fileName = file name you want to use for download
    var url = window.location.protocol + "//" + window.location.host +
        "/md/download?urn=" + urn +
        "&derUrn=" + derUrn +
        "&fileName=" + encodeURIComponent(fileName);

    window.open(url,'_blank');
}

function getThumbnail(urn) {
    console.log("downloadDerivative for urn=" + urn);
    // fileName = file name you want to use for download
    var url = window.location.protocol + "//" + window.location.host +
        "/dm/thumbnail?urn=" + urn;

    window.open(url,'_blank');
}

function isArraySame(arr1, arr2) {
    // If both are undefined or has no value
    if (!arr1 && !arr2)
        return true;

    // If just one of them has no value
    if (!arr1 || !arr2)
        return false;

    return (arr1.sort().join(',') === arr2.sort().join(','));
}

function getDerivativeUrns(derivative, format, getThumbnail, objectIds) {
    console.log(
        "getDerivativeUrns for derivative=" + derivative.outputType +
        " and objectIds=" + (objectIds ? objectIds.toString() : "none"));
    var res = [];
    for (var childId in derivative.children) {
        var child = derivative.children[childId];
        // using toLowerCase to handle inconsistency
        if (child.role === '3d' || child.role.toLowerCase() === format) {
            if (isArraySame(child.objectIds, objectIds)) {
                // Some formats like svf might have children
                if (child.children) {
                    for (var subChildId in child.children) {
                        var subChild = child.children[subChildId];

                        if (subChild.role === 'graphics') {
                            res.push(subChild.urn);
                            if (!getThumbnail)
                                return res;
                        } else if (getThumbnail && subChild.role === 'thumbnail') {
                            res.push(subChild.urn);
                            return res;
                        }
                    }
                } else {
                    res.push(child.urn);
                    return res;
                }
            }
        }
    }

    return null;
}

// OBJ: guid & objectIds are also needed
// SVF, STEP, STL, IGES:
// Posts the job then waits for the manifest and then download the file
// if it's created
function askForFileType(format, urn, guid, objectIds, rootFileName, fileExtType, onsuccess) {
    console.log("askForFileType " + format + " for urn=" + urn);
    var advancedOptions = {
        'stl' : {
            "format": "binary",
            "exportColor": true,
            "exportFileStructure": "single" // "multiple" does not work
        },
        'obj' : {
            "modelGuid": guid,
            "objectIds": objectIds
        }
    };

    $.ajax({
        url: '/md/export',
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify(
            {
                urn: urn,
                format: format,
                advanced: advancedOptions[format],
                rootFileName: rootFileName,
                fileExtType: fileExtType
            }
        )
    }).done(function (data) {
        console.log(data);

        if (data.result === 'success' // newly submitted data
            || data.result === 'created') { // already submitted data
            getManifest(urn, function (res) {
                onsuccess(res);
            });
        }
    }).fail(function(err) {
        showProgress("Could not start translation", "fail");
        console.log('/md/export call failed\n' + err.statusText);
    });
}

// We need this in order to get an OBJ file for the model
function getMetadata(urn, onsuccess) {
    console.log("getMetadata for urn=" + urn);
    $.ajax({
        url: '/md/metadatas/' + urn,
        type: 'GET'
    }).done(function (data) {
        console.log(data);

        // Get first model guid
        // If it does not exists then something is wrong
        // let's check the manifest
        // If get manifest sees a failed attempt then it will
        // delete the manifest
        var md0 = data.data.metadata[0];
        if (!md0) {
            getManifest(urn, function () {});
        } else {
            var guid = md0.guid;
            if (onsuccess !== undefined) {
                onsuccess(guid);
            }
        }
    }).fail(function(err) {
        console.log('GET /md/metadata call failed\n' + err.statusText);
    });
}

function getHierarchy(urn, guid, onsuccess) {
    console.log("getHierarchy for urn=" + urn + " and guid=" + guid);
    $.ajax({
        url: '/md/hierarchy',
        type: 'GET',
        data: {urn: urn, guid: guid}
    }).done(function (data) {
        console.log(data);

        // If it's 'accepted' then it's not ready yet
        if (data.result === 'accepted') {
            // Let's try again
            if (MyVars.keepTrying) {
                window.setTimeout(function() {
                        getHierarchy(urn, guid, onsuccess);
                    }, 500
                );
            } else {
                MyVars.keepTrying = true;
            }

            return;
        }

        // We got what we want
        if (onsuccess !== undefined) {
            onsuccess(data);
        }
    }).fail(function(err) {
        console.log('GET /md/hierarchy call failed\n' + err.statusText);
    });
}

function getProperties(urn, guid, onsuccess) {
    console.log("getProperties for urn=" + urn + " and guid=" + guid);
    $.ajax({
        url: '/md/properties',
        type: 'GET',
        data: {urn: urn, guid: guid}
    }).done(function (data) {
        console.log(data);

        if (onsuccess !== undefined) {
            onsuccess(data);
        }
    }).fail(function(err) {
        console.log('GET /api/properties call failed\n' + err.statusText);
    });
}

function getManifest(urn, onsuccess) {
    console.log("getManifest for urn=" + urn);
    $.ajax({
        url: '/md/manifests/' + urn,
        type: 'GET'
    }).done(function (data) {
        console.log(data);

        if (data.status !== 'failed') {
            if (data.progress !== 'complete') {
                showProgress("Translation progress: " + data.progress, data.status);

                if (MyVars.keepTrying) {
                    // Keep calling until it's done
                    window.setTimeout(function() {
                            getManifest(urn, onsuccess);
                        }, 500
                    );
                } else {
                    MyVars.keepTrying = true;
                }
            } else {
                showProgress("Translation completed", data.status);
                onsuccess(data);
            }
        // if it's a failed translation best thing is to delete it
        } else {
            showProgress("Translation failed", data.status);
            // Should we do automatic manifest deletion in case of a failed one?
            //delManifest(urn, function () {});
        }
    }).fail(function(err) {
        showProgress("Translation failed", 'failed');
        console.log('GET /api/manifest call failed\n' + err.statusText);
    });
}

function delManifest(urn, onsuccess, onerror) {
    console.log("delManifest for urn=" + urn);
    $.ajax({
        url: '/md/manifests/' + urn,
        type: 'DELETE'
    }).done(function (data) {
        console.log(data);
        if (data.result === 'success') {
            if (onsuccess !== undefined) {
                onsuccess(data);
            }
        }
    }).fail(function(err) {
        console.log('DELETE /api/manifest call failed\n' + err.statusText);
        if (onerror !== undefined) {
            onerror(err)
        }
    });
}

/////////////////////////////////////////////////////////////////
// Formats / #apsFormats
// Shows the export file formats available for the selected model
/////////////////////////////////////////////////////////////////

function getFormats(onsuccess) {
    console.log("getFormats");
    $.ajax({
        url: '/md/formats',
        type: 'GET'
    }).done(function (data) {
        console.log(data);

        if (onsuccess !== undefined) {
            onsuccess(data);
        }
    }).fail(function(err) {
        console.log('GET /md/formats call failed\n' + err.statusText);
    });
}

function fillFormats() {
    getFormats(function(data) {
        var apsFormats = $("#apsFormats");
        apsFormats.data("apsFormats", data);

        // Translation and export functionality disabled - no download or delete manifest features
        // This prevents spending credits on translation services
        console.log("Translation functionality disabled - export and manifest deletion are not available");
    });
}

function updateFormats(format) {

    var apsFormats = $("#apsFormats");
    var formats = apsFormats.data("apsFormats");
    apsFormats.empty();

    // obj is not listed for all possible files
    // using this workaround for the time being
    //apsFormats.append($("<option />").val('obj').text('obj'));

    $.each(formats.formats, function(key, value) {
        if (key === 'obj' || value.indexOf(format) > -1) {
            apsFormats.append($("<option />").val(key).text(key));
        }
    });
}

/////////////////////////////////////////////////////////////////
// Files Tree / #apsFiles
// Shows the A360 hubs, projects, folders and files of
// the logged in user
/////////////////////////////////////////////////////////////////

var haveBIM360Hub = false;

function prepareFilesTree() {
    console.log("prepareFilesTree");
    $.getJSON("/api/aps/clientID", function (res) {
        $("#ClientID").val(res.ClientId);
    });

    $('#apsFiles').jstree({
        'core': {
            'themes': {"icons": true},
            'check_callback': true, // make it modifiable
            'data': {
                cache: false,
                "url": '/dm/treeNode',
                "dataType": "json",
                "data": function (node) {
                    return {
                        "href": (node.id === '#' ? '#' : node.original.href)
                    };
                },
                "success": function (nodes) {
                    nodes.forEach(function (n) {
                        if (n.type === 'hubs' && n.href.indexOf('b.') > 0)
                            haveBIM360Hub = true;
                    });

                    if (!haveBIM360Hub) {
                        $("#provisionAccountModal").modal();
                        $("#provisionAccountSave").click(function () {
                            $('#provisionAccountModal').modal('toggle');
                            $('#apsFiles').jstree(true).refresh();
                        });
                        haveBIM360Hub = true;
                    }
                }
            }
        },
        'types': {
            'default': {
                'icon': 'glyphicon glyphicon-cloud'
            },
            '#': {
                'icon': 'glyphicon glyphicon-user'
            },
            'hubs': {
                'icon': 'glyphicon glyphicon-inbox'
            },
            'projects': {
                'icon': 'glyphicon glyphicon-list-alt'
            },
            'items': {
                'icon': 'glyphicon glyphicon-briefcase'
            },
            'folders': {
                'icon': 'glyphicon glyphicon-folder-open'
            },
            'versions': {
                'icon': 'glyphicon glyphicon-time'
            },
            'view3d': {
                'icon': 'glyphicon glyphicon-eye-open'
            },
            'sheet': {
                'icon': 'glyphicon glyphicon-list'
            }
        },
        "plugins": ["types", "contextmenu", "checkbox"], // Added checkbox plugin for view selection
        'checkbox': {
            'keep_selected_style': false,
            'three_state': false,
            'whole_node': false
        },
        'contextmenu': {
            'select_node': false,
            'items': filesTreeContextMenu
        }
    }).bind("before_check.jstree", function (evt, data) {
        // Only allow checking view3d and sheet nodes
        if (data.node.type !== 'view3d' && data.node.type !== 'sheet') {
            evt.preventDefault();
            return false;
        }
    }).bind("check_node.jstree uncheck_node.jstree", function (evt, data) {
        // Handle view/sheet selection/deselection
        if (data.node.type === 'view3d' || data.node.type === 'sheet') {
            var itemType = data.node.type === 'view3d' ? '3D View' : 'Sheet';
            console.log(itemType + " " + data.node.text + " (" + data.node.id + ") - checked: " + data.node.state.checked);

            // Store selected views/sheets in MyVars
            if (!MyVars.selectedViews) {
                MyVars.selectedViews = {};
            }

            if (data.node.state.checked) {
                MyVars.selectedViews[data.node.id] = data.node.original;
            } else {
                delete MyVars.selectedViews[data.node.id];
            }

            var view3dCount = Object.keys(MyVars.selectedViews).filter(function(id) {
                return MyVars.selectedViews[id].type === 'view3d';
            }).length;
            var sheetCount = Object.keys(MyVars.selectedViews).filter(function(id) {
                return MyVars.selectedViews[id].type === 'sheet';
            }).length;

            console.log("Selected: " + view3dCount + " 3D views, " + sheetCount + " sheets");
        }
    }).bind("select_node.jstree", function (evt, data) {
        // Clean up previous instance
        cleanupViewer();

        console.log("Selected item's ID/URN: " + data.node.original.wipid);

        MyVars.selectedNode = data.node;

        if (data.node.type === 'versions') {
            // Store info on selected file
            MyVars.rootFileName = data.node.original.rootFileName;
            MyVars.fileName = data.node.original.fileName;
            MyVars.fileExtType = data.node.original.fileExtType;

            if ($('#wipVsStorage').hasClass('active')) {
                console.log("Using WIP id");
                MyVars.selectedUrn = base64encode(data.node.original.wipid);
            } else {
                console.log("Using Storage id");
                MyVars.selectedUrn = base64encode(data.node.original.storage);
            }

            // Translation disabled - hierarchy and properties are not available
            // Clear any previous hierarchy/properties displays
            $('#apsHierarchy').empty().jstree('destroy');
            $('#apsProperties').empty().jstree('destroy');
            $('#apsProperties').data('apsProperties', null);

            console.log(
                "Version selected: " + data.node.original.fileName,
                ", storage = " + data.node.original.storage,
                ", wipid = " + data.node.original.wipid
            );

            // Fetch 3D views for this version
            loadViewsForVersion(data.node, MyVars.selectedUrn);
        } else {
            // Just open the children of the node, so that it's easier
            // to find the actual versions
            $("#apsFiles").jstree("open_node", data.node);

            // And clear trees to avoid confusion thinking that the
            // data belongs to the clicked model
            $('#apsHierarchy').empty().jstree('destroy');
            $('#apsProperties').empty().jstree('destroy');
        }
    });
}

function loadViewsForVersion(versionNode, selectedUrn) {
    console.log("Loading 3D views and sheets for URN: " + selectedUrn);

    $.ajax({
        url: '/md/views/' + encodeURIComponent(selectedUrn),
        type: 'GET',
        success: function(items) {
            console.log("Received " + items.length + " items");

            if (items.length === 0) {
                console.log("No views or sheets found for this version");
                return;
            }

            // Get the jstree instance
            var tree = $('#apsFiles').jstree(true);

            // Remove existing view/sheet children if any
            if (versionNode.children) {
                versionNode.children.forEach(function(childId) {
                    var child = tree.get_node(childId);
                    if (child && (child.type === 'view3d' || child.type === 'sheet')) {
                        tree.delete_node(childId);
                    }
                });
            }

            // Add views and sheets as children of the version node
            items.forEach(function(item) {
                var nodeIcon = item.type === 'sheet' ? 'glyphicon glyphicon-list' : 'glyphicon glyphicon-eye-open';

                var itemNode = {
                    id: item.id,
                    parent: versionNode.id,
                    text: item.name,
                    type: item.type, // 'view3d' or 'sheet'
                    icon: nodeIcon,
                    original: item
                };

                tree.create_node(versionNode.id, itemNode);
            });

            // Open the version node to show views and sheets
            tree.open_node(versionNode.id);

            var view3dCount = items.filter(function(i) { return i.type === 'view3d'; }).length;
            var sheetCount = items.filter(function(i) { return i.type === 'sheet'; }).length;
            console.log("Added " + view3dCount + " 3D views and " + sheetCount + " sheets to the tree");
        },
        error: function(xhr, status, error) {
            console.log("Error loading views: " + status + " - " + error);
            if (xhr.status === 401) {
                console.log("Session expired or invalid token. Please log in again.");
            } else if (xhr.status === 404) {
                console.log("Views/sheets not available for this version");
            } else {
                console.log("Failed to load views/sheets for this version");
            }
        }
    });
}

function filesTreeContextMenu(node, callback) {
    // Context menu disabled - upload/attachment functionality removed
    return;
}

/////////////////////////////////////////////////////////////////
// Hierarchy Tree / #apsHierarchy
// Shows the hierarchy of components in selected model
/////////////////////////////////////////////////////////////////

function showHierarchy(urn, guid, objectIds, rootFileName, fileExtType) {

    // You need to
    // 1) Post a job
    // 2) Get matadata (find the model guid you need)
    // 3) Get the hierarchy based on the urn and model guid

    // Get svf export in order to get hierarchy and properties
    // for the model
    var format = 'svf';
    askForFileType(format, urn, guid, objectIds, rootFileName, fileExtType, function (manifest) {
        getMetadata(urn, function (guid) {
            showProgress("Retrieving hierarchy...", "inprogress");

            getHierarchy(urn, guid, function (data) {
                showProgress("Retrieved hierarchy", "success");

                for (var derId in manifest.derivatives) {
                    var der = manifest.derivatives[derId];
                    // We just have to make sure there is an svf
                    // translation, but the viewer will find it
                    // from the urn
                    if (der.outputType === 'svf') {

                        initializeViewer(urn);
                    }
                }

                prepareHierarchyTree(urn, guid, data.data);
            });
        });
    });
}

function addHierarchy(nodes) {
    for (var nodeId in nodes) {
        var node = nodes[nodeId];

        // We are also adding properties below that
        // this function might iterate over and we should skip
        // those nodes
        if (node.type && node.type === 'property' || node.type === 'properties') {
            // skip this node
            var str = "";
        } else {
            node.text = node.name;
            node.children = node.objects;
            if (node.objectid === undefined) {
                node.type = 'dunno'
            } else {
                node.id = node.objectid;
                node.type = 'object'
            }
            addHierarchy(node.objects);
        }
    }
}

function prepareHierarchyTree(urn, guid, json) {
    // Convert data to expected format
    addHierarchy(json.objects);

    // Enable the hierarchy related controls
    $("#apsFormats").removeAttr('disabled');
    $("#downloadExport").removeAttr('disabled');

    // Store info of selected item
    MyVars.selectedUrn = urn;
    MyVars.selectedGuid = guid;

    // init the tree
    $('#apsHierarchy').jstree({
        'core': {
            'check_callback': true,
            'themes': {"icons": true},
            'data': json.objects
        },
        'checkbox' : {
            'tie_selection': false,
            "three_state": true,
            'whole_node': false
        },
        'types': {
            'default': {
                'icon': 'glyphicon glyphicon-cloud'
            },
            'object': {
                'icon': 'glyphicon glyphicon-save-file'
            }
        },
        "plugins": ["types", "sort", "checkbox", "ui", "themes", "contextmenu"],
        'contextmenu': {
            'select_node': false,
            'items': hierarchyTreeContextMenu
        }
    }).bind("select_node.jstree", function (evt, data) {
        if (data.node.type === 'object') {
            var urn = MyVars.selectedUrn;
            var guid = MyVars.selectedGuid;
            var objectId = data.node.original.objectid;

            // Empty the property tree
            $('#apsProperties').empty().jstree('destroy');

            fetchProperties(urn, guid, function (props) {
                preparePropertyTree(urn, guid, objectId, props);
                selectInViewer([objectId]);
            });
        }
    }).bind("check_node.jstree uncheck_node.jstree", function (evt, data) {
        // To avoid recursion we are checking if the changes are
        // caused by a viewer selection which is calling
        // selectInHierarchyTree()
        if (!MyVars.selectingInHierarchyTree) {
            var elem = $('#apsHierarchy');
            var nodeIds = elem.jstree("get_checked", null, true);

            // Convert from strings to numbers
            var objectIds = [];
            $.each(nodeIds, function (index, value) {
                objectIds.push(parseInt(value, 10));
            });

            selectInViewer(objectIds);
        }
    });
}

function selectInHierarchyTree(objectIds) {
    MyVars.selectingInHierarchyTree = true;

    var tree = $("#apsHierarchy").jstree();

    // First remove all the selection
    tree.uncheck_all();

    // Now select the newly selected items
    for (var key in objectIds) {
        var id = objectIds[key];

        // Select the node
        tree.check_node(id);

        // Make sure that it is visible for the user
        tree._open_to(id);
    }

    MyVars.selectingInHierarchyTree = false;
}

function hierarchyTreeContextMenu(node, callback) {
    var menuItems = {};

    var menuItem = {
        "label": "Select in Fusion",
        "action": function (obj) {
            var path = $("#apsHierarchy").jstree().get_path(node,'/');
            alert(path);

            // Open this in the browser:
            // fusion360://command=open&file=something&properties=MyCustomPropertyValues
            var url = "fusion360://command=open&file=something&properties=" + encodeURIComponent(path);
            $("#fusionLoader").attr("src", url);
        }
    };
    menuItems[0] = menuItem;

    //callback(menuItems);

    //return menuItems;
    return null; // for the time being
}

/////////////////////////////////////////////////////////////////
// Property Tree / #apsProperties
// Shows the properties of the selected sub-component
/////////////////////////////////////////////////////////////////

// Storing the collected properties since you get them for the whole
// model. So when clicking on the various sub-components in the
// hierarchy tree we can reuse it instead of sending out another
// http request
function fetchProperties(urn, guid, onsuccess) {
    var props = $("#apsProperties").data("apsProperties");
    if (!props) {
        getProperties(urn, guid, function(data) {
            $("#apsProperties").data("apsProperties", data.data);
            onsuccess(data.data);
        })
    } else {
        onsuccess(props);
    }
}

// Recursively add all the additional properties under each
// property node
function addSubProperties(node, props) {
    node.children = node.children || [];
    for (var subPropId in props) {
        var subProp = props[subPropId];
        if (subProp instanceof Object) {
            var length = node.children.push({
                "text": subPropId,
                "type": "properties"
            });
            var newNode = node.children[length-1];
            addSubProperties(newNode, subProp);
        } else {
            node.children.push({
                "text": subPropId + " = " + subProp.toString(),
                "type": "property"
            });
        }
    }
}

// Add all the properties of the selected sub-component
function addProperties(node, props) {
    // Find the relevant property section
    for (var propId in props) {
        var prop = props[propId];
        if (prop.objectid === node.objectid) {
            addSubProperties(node, prop.properties);
        }
    }
}

function preparePropertyTree(urn, guid, objectId, props) {
    // Convert data to expected format
    var data = { 'objectid' : objectId };
    addProperties(data, props.collection);

    // init the tree
    $('#apsProperties').jstree({
        'core': {
            'check_callback': true,
            'themes': {"icons": true},
            'data': data.children
        },
        'types': {
            'default': {
                'icon': 'glyphicon glyphicon-cloud'
            },
            'property': {
                'icon': 'glyphicon glyphicon-tag'
            },
            'properties': {
                'icon': 'glyphicon glyphicon-folder-open'
            }
        },
        "plugins": ["types", "sort"]
    }).bind("activate_node.jstree", function (evt, data) {
       //
    });
}

/////////////////////////////////////////////////////////////////
// Viewer
// Based on Autodesk Viewer basic sample
// https://developer.autodesk.com/api/viewerapi/
/////////////////////////////////////////////////////////////////

function cleanupViewer() {
    // Clean up previous instance
    if (MyVars.viewer && MyVars.viewer.model) {
        console.log("Unloading current model from Autodesk Viewer");

        //MyVars.viewer.impl.unloadModel(MyVars.viewer.model);
        //MyVars.viewer.impl.sceneUpdated(true);
        MyVars.viewer.tearDown();
        MyVars.viewer.setUp(MyVars.viewer.config);

        document.getElementById('apsViewer').style.display = 'none';
    }
}

function initializeViewer(urn) {
    cleanupViewer();

    document.getElementById('apsViewer').style.display = 'block';

    console.log("Launching Autodesk Viewer for: " + urn);


    

    var options = {
        document: 'urn:' + urn,
        env: 'AutodeskProduction',
        getAccessToken: get3LegToken // this works fine, but if I pass get3LegToken it only works the first time
    };

    if (MyVars.viewer) {
        loadDocument(MyVars.viewer, options.document);
    } else {
        var viewerElement = document.getElementById('apsViewer');
        var config = {
            extensions: ['Autodesk.Viewing.WebVR', 'Autodesk.Viewing.MarkupsGui', 'Autodesk.AEC.LevelsExtension'],
            experimental: ['webVR_orbitModel']
        };
        MyVars.viewer = new Autodesk.Viewing.Private.GuiViewer3D(viewerElement, config);
        Autodesk.Viewing.Initializer(
            options,
            function () {
                MyVars.viewer.start(); // this would be needed if we also want to load extensions
                loadDocument(MyVars.viewer, options.document);
                addSelectionListener(MyVars.viewer);
            }
        );
    }
}

function addSelectionListener(viewer) {
    viewer.addEventListener(
        Autodesk.Viewing.SELECTION_CHANGED_EVENT,
        function (event) {
            selectInHierarchyTree(event.dbIdArray);

            var dbId = event.dbIdArray[0];
            if (dbId) {
                viewer.getProperties(dbId, function (props) {
                   console.log(props.externalId);
                });
            }
        });
}

// Get the full path of the selected body
function getFullPath(tree, dbId) {
    var path = [];
    while (dbId) {
        var name = tree.getNodeName(dbId);
        path.unshift(name);
        dbId = tree.getNodeParentId(dbId);
    }

    // We do not care about the top 2 items because it's just the file name
    // and root component name
    path = path.splice(2, path.length - 1)

    return path.join('+');
}

function showAllProperties(viewer) {
    var instanceTree = viewer.model.getData().instanceTree;

    var allDbIds = Object.keys(instanceTree.nodeAccess.dbIdToIndex);

    for (var key in allDbIds) {
        var id = allDbIds[key];
        viewer.model.getProperties(id, function (data) {
            var str = "";
        });
    }
}

// Adds a button to the toolbar that can be used
// to check for body sepcific data in our mongo db
// Call this once the Viewer has been set up
function addFusionButton(viewer) {
    var button = new Autodesk.Viewing.UI.Button('toolbarFusion');
    button.onClick = function (e) {
        var ids = viewer.getSelection();
        if (ids.length === 1) {
            var tree = viewer.model.getInstanceTree();
            var fullPath = getFullPath(tree, ids[0]);
            console.log(fullPath);

            $.ajax ({
                url: '/dm/fusionData/' + viewer.model.loader.svfUrn + '/' + encodeURIComponent(fullPath),
                type: 'GET'
            }).done (function (data) {
                console.log('Retrieved data');
                console.log(data);

                alert(JSON.stringify(data, null, 2));
            }).fail (function (xhr, ajaxOptions, thrownError) {
                alert('Failed to retrieve data') ;
            }) ;
        }
    };
    button.addClass('toolbarFusionButton');
    button.setToolTip('Show Fusion properties');

    // SubToolbar
    var subToolbar = new Autodesk.Viewing.UI.ControlGroup('myFusionAppGroup');
    subToolbar.addControl(button);

    if (viewer.toolbar) {
        viewer.toolbar.addControl(subToolbar);
    } else {
        viewer.addEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, function() {
            viewer.toolbar.addControl(subToolbar);
        });
    }
}

function loadDocument(viewer, documentId) {
    // Set the Environment to "Riverbank"
    viewer.setLightPreset(8);

    // Make sure that the loaded document's setting won't
    // override it and change it to something else
    viewer.prefs.tag('ignore-producer');

    Autodesk.Viewing.Document.load(
        documentId,
        // onLoad
        function (doc) {
            const node = doc.getRoot().getDefaultGeometry();
            if (node) {
                viewer.loadDocumentNode(doc, node);
                addFusionButton(viewer);
            }
        },
        // onError
        function (errorMsg) {
            //showThumbnail(documentId.substr(4, documentId.length - 1));
        }
    )
}

function selectInViewer(objectIds) {
    if (MyVars.viewer) {
        MyVars.viewer.select(objectIds);
    }
}

/////////////////////////////////////////////////////////////////
// Other functions
/////////////////////////////////////////////////////////////////

function showProgress(text, status) {
    var progressInfo = $('#progressInfo');
    var progressInfoText = $('#progressInfoText');
    var progressInfoIcon = $('#progressInfoIcon');

    var oldClasses = progressInfo.attr('class');
    var newClasses = "";
    var newText = text;

    if (status === 'failed') {
        newClasses = 'btn btn-danger';
    } else if (status === 'inprogress' || status === 'pending') {
        newClasses = 'btn btn-warning';
        newText += " (Click to stop)";
    } else if (status === 'success') {
        newClasses = 'btn btn-success';
    } else {
        newClasses = 'btn btn-info';
    }

    // Only update if changed
    if (progressInfoText.text() !== newText) {
        progressInfoText.text(newText);
    }

    if (oldClasses !== newClasses) {
        progressInfo.attr('class', newClasses);

        if (newClasses === 'btn btn-warning') {
            progressInfoIcon.attr('class', 'glyphicon glyphicon-refresh glyphicon-spin');
        } else {
            progressInfoIcon.attr('class', '');
        }
    }
}


