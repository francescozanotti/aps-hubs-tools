## Easiest  approach (no DLL): ACC “Export to PDF” API for Revit/DWG 2D views & sheets

ACC now exposes an **Export to PDF** endpoint that can take **a Revit file version + specific 2D views/sheets** and produce PDFs directly into an ACC folder. This fits your app perfectly: you already list the versions and the view/sheet tree—just pass the chosen IDs and a target folder. ([Autodesk Platform Services][1])

**High-level flow**

1. User selects: file version, sheets/views, output ACC folder, filename pattern.
2. Your server calls the ACC export endpoint with:

   * the **file version URN** (you already have it),
   * an array of **view/sheet identifiers**,
   * **PDF options** (combine or separate, naming, etc.),
   * **destination ACC folder** (storage URN).
3. Poll job status; when done, the PDFs appear in the chosen ACC folder.
   (Autodesk has a blog + examples detailing payload shape and options.) ([Autodesk Platform Services][1])

**When to choose this:** You want server-side, scalable PDF exports of **2D Revit views/sheets** (and DWG layouts) with minimal infrastructure. No Revit desktop, no Design Automation app bundle, no DLL.

---
---
---
---
---
---
---
---

---
---
---
---
---
---
---
---
---












# Option A — ACC “Export to PDF” API (fastest to ship)

**What it does:** From an **ACC file version** (RVT/DWG) and a set of **2D views/sheets**, it generates PDFs **in the cloud** and returns a **ZIP download URL**. You then upload those PDFs to the ACC folder your user picked. No Revit engine required. ([Autodesk Platform Services][1])

**Flow in your Node app**

1. **User selects**: version URN, [view/sheet IDs], output ACC folder.
2. **POST** `/v1/files:export-pdf-files` with the version + the selected 2D views/sheets. (You can export individual files too; all results come back in one ZIP.) ([Autodesk Platform Services][1])
3. **Poll** `/v1/files:export-status-and-result` until `state: SUCCESS`; you’ll get a **signed URL** to the ZIP. ([Autodesk Platform Services][2])
4. **Download** the ZIP to your server, **unzip**, then **upload** PDFs to the **chosen ACC folder** via the ACC “upload to Files” tutorial (create storage → signed S3 URL → PUT bytes → create version). ([Autodesk Platform Services][3])

> Note: The ACC Files export endpoint returns a **download link**, not “save to this folder”; uploading the results to a folder is one extra step (tutorial shows exactly how). ([GitHub][4])

**Why choose this**

* Smallest moving parts, **no Revit** needed.
* Perfect match to your UI (you already list versions + 2D views/sheets).
* Vector PDFs supported (ACC team blog + docs). ([Autodesk Platform Services][5])






## Passing the user’s selections (IDs, names, versions, target folder)

You already show the **versions** and the **view/sheet tree**. Map that 1:1 into the API payloads:

### For ACC “Export to PDF”

* Use the **ACC Files version** and an array of **2D view/sheet identifiers** the endpoint expects; the blog/tutorial walk through composing the body and what IDs are valid. You get a **ZIP signed URL** back; then upload to the user-chosen folder via the Files upload tutorial. ([Autodesk Platform Services][1])







---
---
---
---
---
---
---
---

---
---
---
---
---
---
---
---
---




















# Use ACC “Export to PDF” (Files API)

This endpoint takes an **ACC file version** (RVT/DWG) + **selected 2D views/sheets** and returns a **ZIP download URL** when the job finishes. No Revit, no DA4R app bundle, no uploads back to ACC. ([Autodesk Platform Services][1])

### Minimal flow (server-side)

1. **User picks**: version URN, the 2D floor-plan views and/or sheets.
2. **POST** `v1/files:export-pdf-files` with those selections. The API enqueues a job and returns an **exportId**. ([Autodesk Platform Services][1])
3. **Poll** `v1/files:export-status-and-result?exportId=...` until `state: SUCCESS`. The payload includes a **time-limited signed URL** to a **ZIP**; just surface that URL as a “Download PDFs” button in your UI. ([Autodesk Platform Services][2])

> Docs + tutorial (same pattern, with examples of payload shape/options). ([Autodesk Platform Services][3])

### Example wiring (Node-ish pseudo)

```js
// 1) kick off
POST /acc/v1/files:export-pdf-files
{
  "files": [{
    "versionUrn": "urn:adsk.wipprod:fs.file:vf.XXXXXXXX",
    "views": [
      // your selected 2D view/sheet identifiers
      {"type":"sheet","id":"<sheet-id>"},
      {"type":"view2d","id":"<view-id>"}
    ],
    "pdfOptions": {
      "combine": false,            // one PDF per view/sheet (or true for single file)
      "naming": "{SheetNumber}_{SheetName}" // if supported; otherwise use defaults
    }
  }]
}
// → { exportId: "abcd-1234" }

// 2) poll
GET /acc/v1/files:export-status-and-result?exportId=abcd-1234
// when SUCCESS → result.output.signedUrl = "https://.../export.zip"
```

(Exact request schema/accepted IDs are in the ACC Files API references and blog.) ([Autodesk Platform Services][1])

### Where do your view/sheet IDs come from?

You already display the 2D tree per file version; use the same identifiers the Files Export endpoint expects. Autodesk’s blog explains selecting **2D views & sheets** (RVT/DWG) for this export. If you ever need a different route, the **Model Derivative** blog shows another 2D→PDF workflow, but for your case the Files API is simpler. ([Autodesk Platform Services][4])





























---
---
---
---
---
---
---
---

---
---
---
---
---
---
---
---
---



**Use ACC “Export to PDF.”** It’s cloud-side, handles **many sheets/floor plans across multiple RVT files**, returns you **one ZIP download link per job**, and **doesn’t spend Flex tokens**. You only need tokens if you go with **Design Automation for Revit (DA4R)** or if you run **Model Derivative translations** (the *translate* POST job is the billed one). Details below.

---

## What happens with lots of selections (50–100) from multiple RVTs?

* The **ACC Files → Export PDF** endpoint lets you send **multiple files in one request** (array of file items). It will generate PDFs for the selected **2D sheets/views** (RVT/DWG) and return **a single ZIP** (time-limited signed URL). You can also submit several jobs and get multiple ZIP links if you prefer. ([Autodesk Platform Services][1])
* This route is **explicitly for 2D** (sheets & 2D views). That matches your requirement (no 3D). ([Autodesk Platform Services][1])

## Does ACC “Export to PDF” consume tokens?

* Autodesk’s pricing notes consistently call out **Model Derivative translation** as the consumption event (POST **/job**), not “every endpoint.” The **ACC Files Export** docs show a **job + status + signed URL** flow with **no token mention**; it rides on your ACC entitlements and requires appropriate permissions, but **does not use Flex tokens**. ([Autodesk Platform Services][2])
* By contrast, **Model Derivative translation** (to SVF2, etc.) **does** have a metered cost on the POST job. You’re *not* required to translate for the ACC Files → PDF export path. ([Autodesk Platform Services][2])

## Do I need translations first?

* **No** for ACC → PDF. The export runs off the **ACC Files backend**; it doesn’t require a Viewable (SVF2) translation. Many teams export PDFs for RVT/DWG stored in ACC without translating to viewer format at all. (For viewer workflows and data extraction, that’s when Model Derivative translation applies—and that’s the billed action.) ([Autodesk Platform Services][1])

## When would DA4R (tokens) be worth it?

Only if you need power features that ACC Export doesn’t provide, e.g.:

* Revit-API-level control before export (apply view templates, tweak parameters, per-sheet overrides, custom print settings, stamping/watermarks, multi-output bundles, etc.).
* Handling corner cases ACC Export doesn’t support.
  DA4R runs **headless Revit in Autodesk’s cloud** and **does consume tokens** (per processing hour). It supports **direct PDF export** in Revit 2022+ via `PDFExportOptions`. ([Autodesk Platform Services][3])

---

## Suggested plan for you

1. **Start with ACC Files → Export PDF** for your multi-file, multi-sheet/floor-plan batches.

   * Kick off: `POST /v1/files:export-pdf-files` with an array of items `{ versionUrn, views:[...], pdfOptions }`.
   * Poll: `GET /v1/files:export-status-and-result?exportId=...` → **signed ZIP URL** → show “Download” in your app. ([Autodesk Platform Services][1])
2. **Only add DA4R** if/when you need Revit-level customization that ACC Export can’t do. ([Autodesk Platform Services][3])

---

## Handy refs (official)

* **ACC Files → Export PDF (POST)** and **Status/Result (GET)**. ([Autodesk Platform Services][1])
* **Tutorial: Export PDFs from ACC Files** (payload structure, workflow). ([Autodesk Platform Services][4])
* **ACC Sheets → Export PDFs API** (additional sheet-module export path). ([Autodesk Platform Services][5])
* **Model Derivative pricing note** – consumption is the **translate job**. ([Autodesk Platform Services][2])
* **Flex tokens** & **DA4R costs** context. ([autodesk.com][6])

If you want, I can drop a ready-to-paste **`POST /v1/files:export-pdf-files` body** that matches your current selection objects (version URNs + sheet/view IDs) and a tiny polling handler that surfaces the ZIP link.

[1]: https://aps.autodesk.com/en/docs/acc/v1/reference/http/v1-files-export-pdf-files-POST/?utm_source=chatgpt.com "POST PDF File Export | Autodesk Construction Cloud APIs"
[2]: https://aps.autodesk.com/blog/forge-pricing-explained-3-what-does-each-forge-api-cost?utm_source=chatgpt.com "Forge Pricing Explained #3 - What does each Forge API ..."
[3]: https://aps.autodesk.com/blog/export-pdf-revit-design-automation-sample?utm_source=chatgpt.com "Export PDF by Revit Automation sample"
[4]: https://aps.autodesk.com/en/docs/acc/v1/tutorials/files/export-pdf-files?utm_source=chatgpt.com "Export Files from the ACC Files Tool"
[5]: https://aps.autodesk.com/blog/api-exporting-acc-sheet-pdf-released?utm_source=chatgpt.com "API of Exporting ACC Sheet to PDF is Released"
[6]: https://www.autodesk.com/benefits/flex/flex-rate-sheet?utm_source=chatgpt.com "Estimate Tokens with Flex Rate Sheet"
 