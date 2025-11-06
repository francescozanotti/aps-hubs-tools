## Domanda

i made an acc app with node js that reads my hubs, i can see a tree hierarchy of my projects in the hub, i can see the ifc and revit files in my hub folders, and i can see the versions of my files. when i expand the file version, i see the list of 3d views and sheets in the file version, that i can multiselect them, and then send them to print (to pdf files) into a chosen acc folder. the printing part is not implemented yet as i have no idea how to: -how to check what aps api should i use for the printing dll (this is the list i found of aps apis: https://aps.autodesk.com/developer/documentation) -how to make this dll (need any kind of guidance step by step. i think i need visual studio to compile the dll so i basically need to make some kind of printing addin for revit) -how to pass to the dll the parameters the user selects (list of files selected, where are they - their urn, the chosen filename, version, what 3d views, what sheets, etc)

## Risposta di ChatGPT

Awesome—you're 90% there. The missing piece is **how to generate PDFs** from those ACC file versions + selected 3D views/sheets. You have three viable paths (no DLL required unless you want desktop-side automation):

# 1) Easiest (no DLL): ACC “Export to PDF” API for Revit/DWG 2D views & sheets

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

# 2) Also no DLL: Model Derivative “Revit 2D views → PDF” workflow

For many Revit files, **Model Derivative** can generate PDFs of **2D views** (again, not 3D) via its derivative pipeline, with some caveats noted by Autodesk. It’s another lightweight, cloud-only route. ([Autodesk Platform Services][2])

**When to choose this:** You’re already using MD for viewables and your target is **2D** only. Check Autodesk’s prerequisites in the article. ([autodesk-developer.zendesk.com][3])

---

# 3) Cloud “Revit engine” route: Design Automation for Revit (DA4R)

If you need full Revit API control (custom naming, batches, title-block params, etc.), use **Design Automation for Revit**. Since **Revit 2022+** it supports **direct PDF export** via `PDFExportOptions` (this used to be unsupported in early DA4R versions, but is supported now). Autodesk provides a sample that exports **views/sheets → PDFs** in the cloud. ([GitHub][4])

**High-level flow**

1. Build a tiny **DA4R app bundle** (C#) that:

   * Opens the RVT (downloaded from the version URN),
   * Locates views/sheets by IDs/names you pass in,
   * Calls `Document.Export(outputFolder, fileName, IList<ElementId>, new PDFExportOptions { ... })`.
     (API references: `PDFExportOptions`, `Document.Export(...)`). ([revitapidocs.com][5])
2. Create an **Activity** (defines Revit engine version + command line).
3. For each export request from your UI, submit a **WorkItem** with:

   * **Input RVT** (ACC storage signed URL),
   * **Config JSON** (selected views/sheets, naming, DPI, combine-into-one, etc.),
   * **Output target** (ACC storage signed URL).
4. Monitor WorkItem; upload PDFs back to ACC.

Autodesk’s sample repos + blog post show the end-to-end wiring (including JSON inputs/outputs). ([GitHub][4])

**When to choose this:** You need **maximum control** or want to support **custom automation beyond ACC’s export**. Still no desktop DLL needed.

---

## What about 3D views?

Revit/ACC PDF exports are fundamentally **2D** (sheets, plans, sections, elevations). **3D to “3D-PDF”** isn’t natively supported by Revit/ACC APIs; you’d typically export images, DWG, or use third-party tooling for U3D/PRC. (DA4R or Viewer snapshots can produce 3D viewport images, but not interactive 3D PDFs.) ([help.autodesk.com][6])

---

## If you really want a desktop DLL (Revit add-in)

You can build a **Revit add-in DLL** (C#/.NET Framework) and drive printing locally—useful if a user sits at a Revit workstation. But it’s more ops-heavy (needs Revit installed, user session, printer drivers, ACC Desktop Connector or API plumbing).

**Steps (very short version)**

1. **Install** Visual Studio + Revit SDK, target **.NET Framework 4.8**.
2. **New Class Library** → reference `RevitAPI.dll` & `RevitAPIUI.dll`.
3. Implement `IExternalCommand`:

   ```csharp
   public class ExportToPdfCmd : IExternalCommand {
     public Result Execute(ExternalCommandData c, ref string m, ElementSet e) {
       var uiapp = c.Application; var doc = uiapp.ActiveUIDocument.Document;
       var viewIds = /* from your passed params */;
       var opts = new PDFExportOptions {
         FileName = "MyFile.pdf",
         Combine = false, // or true
         // set paper size, zoom, rasterQuality, etc.
       };
       using (var t = new Transaction(doc, "PDF Export")) {
         t.Start();
         doc.Export("C:\\out", "nameTemplate", viewIds, opts);
         t.Commit();
       }
       return Result.Succeeded;
     }
   }
   ```

   (API: `PDFExportOptions`, `Document.Export(...)`). ([revitapidocs.com][5])
4. **Add-in manifest** (`.addin`) points to your DLL; copy to `%ProgramData%\Autodesk\Revit\Addins\20XX`.
5. **Passing parameters** from your Node app → DLL: run Revit with a **command-line journal**, read a **JSON file** on disk, named pipe, or local HTTP endpoint. (This is why cloud routes are simpler.)

**Caveats:** Desktop printing has driver quirks; PDF settings often behave differently across printers—many devs avoid it when a cloud option exists. ([LinkedIn][7])

---

## How to pass the user selections (all paths)

### You already have:

* **File version URN** (from Data Management/ACC Docs). If you need examples of version URN wiring and relationships, see APS Data Management “Basics”. ([Autodesk Platform Services][8])

### Map your UI → API payload

* **Views/sheets identifiers:**

  * **ACC Export API / Model Derivative**: use the **view/sheet IDs** the service expects (often derived from the Revit GUIDs present in the viewable manifest). Autodesk blogs show getting derivative URNs and mapping to viewable IDs. ([Autodesk Platform Services][9])
  * **DA4R**: pass **Revit ElementIds** or **view names** in your JSON; your app bundle locates them inside the RVT before calling `Export(...)`. Samples show exactly this. ([GitHub][4])
* **Destination folder**: create a **storage object** in the target ACC folder; use its **signed S3 URL** as DA4R output or ACC Export target. Autodesk’s Postman collection shows the exact steps (create version set, storage, signed URL). ([GitHub][10])
* **Filename & options**: ACC Export API/DA4R both support patterns and options (combine single PDF vs one per sheet, DPI, paper size). See respective docs/samples. ([Autodesk Platform Services][1])

---

## Recommended architecture for you (pragmatic)

* **Primary**: Use **ACC Export to PDF API** for Revit 2D views/sheets. It’s the shortest path from your current UI to PDFs in an ACC folder, fully cloud-side. ([Autodesk Platform Services][1])
* **Fallback**: If some edge files don’t meet the ACC export constraints, try **Model Derivative** (Revit 2D → PDF). ([autodesk-developer.zendesk.com][3])
* **Advanced**: For custom workflows, batch rules, or metadata-driven naming, add **DA4R** with `PDFExportOptions`. Start from Autodesk’s **revit→pdf sample**—wire your selection JSON straight into the WorkItem. ([GitHub][4])

If you want, I can sketch:

* the exact **ACC Export** payload (with your current selection data structure),
* a **DA4R** minimal app-bundle `Command.cs` + `activity.json` + `workitem.json`,
* and the **Data Management** upload flow (storage → signed URL → new version). ([Autodesk Platform Services][8])

Which route do you want to implement first?

[1]: https://aps.autodesk.com/blog/acc-api-export-2d-view-and-sheet-revit-or-dwg-pdf?utm_source=chatgpt.com "ACC API: Export 2D View and Sheet of Revit or DWG to PDF"
[2]: https://aps.autodesk.com/blog/download-your-revit-2d-views-pdfs?utm_source=chatgpt.com "Download your Revit 2d views as PDFs"
[3]: https://autodesk-developer.zendesk.com/hc/en-us/articles/30625053180941-Download-your-Revit-2d-views-as-PDFs?utm_source=chatgpt.com "Download your Revit 2d views as PDFs"
[4]: https://github.com/autodesk-platform-services/aps-export-revit-pdf?utm_source=chatgpt.com "autodesk-platform-services/aps-export-revit-pdf ..."
[5]: https://www.revitapidocs.com/2022/e4236fc8-f8e7-fc74-1b81-9e3a4d9e966b.htm?utm_source=chatgpt.com "PDFExportOptions Class"
[6]: https://help.autodesk.com/view/RVT/2024/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Advanced_Topics_Export_html&utm_source=chatgpt.com "Export"
[7]: https://www.linkedin.com/posts/gavincrump_printing-pdfs-from-revitwhy-is-it-so-hard-activity-7301064140406611968-MZrA?utm_source=chatgpt.com "Printing PDFs in Revit: a never-ending adventure"
[8]: https://aps.autodesk.com/en/docs/data/v2/overview/basics?utm_source=chatgpt.com "API Basics | Data Management API"
[9]: https://aps.autodesk.com/blog/get-derivative-urn-accbim360-file-viewing-it-viewer?utm_source=chatgpt.com "Get the derivative URN of an ACC/BIM360 file for viewing it ..."
[10]: https://github.com/autodesk-platform-services/aps-acc-sheet.api-postman.collection?utm_source=chatgpt.com "autodesk-platform-services/aps-acc-sheet.api-postman. ..." 




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
---

## Domanda due

all approaches dont sound wrong to me. but i just want to specify i have: 2d views (floor plans) 3d views (i wont export 3d views) i need to export sheets and floor plans of my models from my app (that reads and writes acc) i cant have a revit installed locally on my pc, and dont have the files. and cant download them to my pc for editing them/ launching local addins. it must be a task that gets executed remotely somewhere else: the printing automation must be processed not on my pc. im able to even use flex tokens, since i have them on my aps account, but not to use revit. i can only use revit just in case of developing a dll (will need it for debugging the visual studio compiled dll) please respond again to the original question, given these new constraints

# Risposta due

Great—your constraints narrow this down nicely:

* **Only 2D (floor plans + sheets)** ✅
* **Must run remotely (no local Revit, no local files)** ✅
* **You can use Flex tokens** ✅

Given that, you have two cloud-first, production-grade options. A desktop DLL is unnecessary (you’d only build one for DA4R testing, not to run exports on your PC).

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

---

# Option B — Design Automation for Revit (DA4R) (maximum control)

**What it does:** Runs **headless Revit in Autodesk’s cloud**; your “app bundle” (a small C# DLL) opens the RVT, finds the selected sheets/views, and calls `Document.Export(..., PDFExportOptions)` to produce PDFs. Flex tokens cover the engine time. **No local Revit runtime.** ([Autodesk Platform Services][6])

**Flow**

1. Build a tiny **DA4R app bundle** (C#) that:

   * Reads your JSON (list of view/sheet identifiers + options),
   * Resolves them in the model,
   * Calls `Document.Export(outputFolder, nameTemplate, IList<ElementId>, new PDFExportOptions { … })`. ([Autodesk][7])
2. Register an **Activity** targeting Revit 2022+ (PDF export supported there). ([Autodesk Platform Services][8])
3. For each job, submit a **WorkItem** with:

   * **Input RVT** (signed URL from ACC version),
   * **Params JSON** (your user selections),
   * **Output** (zip/pdf) to a **signed URL**, then upload results into the chosen ACC folder.
     Autodesk sample “revit → pdf” shows the full pattern. ([Autodesk Platform Services][9])

**Why choose this**

* Full control over naming, export setups, title block params, per-sheet overrides, combining, etc.
* Cloud-only runtime (uses Flex tokens).
* Good fallback if ACC export doesn’t cover an edge case.

---

## Passing the user’s selections (IDs, names, versions, target folder)

You already show the **versions** and the **view/sheet tree**. Map that 1:1 into the API payloads:

### For ACC “Export to PDF”

* Use the **ACC Files version** and an array of **2D view/sheet identifiers** the endpoint expects; the blog/tutorial walk through composing the body and what IDs are valid. You get a **ZIP signed URL** back; then upload to the user-chosen folder via the Files upload tutorial. ([Autodesk Platform Services][1])

### For DA4R

* Pass a JSON like:

  ```json
  {
    "inputRvtUrl": "https://...signed-url-from-ACC...",
    "export": {
      "combine": false,
      "filenamePattern": "{SheetNumber}_{SheetName}",
      "views": [ { "type":"sheet", "id": 12345 }, { "type":"view", "name":"Level 1 - Floor Plan" } ]
    },
    "outputZipUrl": "https://...signed-upload-url..."
  }
  ```

  Your C# reads it, resolves ElementIds by id/name, and calls `Document.Export`. Autodesk’s samples show workitem JSON wiring and retrieving custom config payloads. ([GitHub][10])

---

## Auth & scopes (quick pointers)

* You’re already using ACC/DM; keep using **3-leg** (impersonation) or **2-leg with user impersonation** where required by ACC endpoints. The **export** and **status** docs outline the auth model, and the **upload to ACC** tutorial covers creating storage + signed S3 URLs. ([Autodesk Platform Services][2])

---

## Which should you pick?

* **Start with ACC “Export to PDF”** for sheets + floor plans. It’s the shortest path and 100% cloud. ([Autodesk Platform Services][1])
* **Add DA4R** when you need advanced export logic or if a file/version doesn’t meet the ACC export constraints. The official Revit→PDF samples are ready to clone. ([Autodesk Platform Services][9])

---

## Ready-to-use references

* **ACC Files → Export PDFs (Revit/DWG 2D views & sheets)**: endpoint + status + tutorial. ([Autodesk Platform Services][1])
* **ACC blog (2D views/sheets export)**: overview & caveats. ([Autodesk Platform Services][5])
* **Upload to ACC folder (Files tool)**: storage → signed URL → upload. ([Autodesk Platform Services][3])
* **DA4R Revit → PDF (sample & blog)**: full code and setup. ([Autodesk Platform Services][9])
* **DA4R PDF export supported (Revit 2022+)**. ([Autodesk Platform Services][8])

---

If you want, I can drop in:

* a **POST body** template for `/v1/files:export-pdf-files` that matches your current selection data,
* a minimal **DA4R app-bundle** `Command.cs` that reads your JSON and exports exactly those sheets/plans, and
* the **ACC upload** steps stitched together as Node code.

[1]: https://aps.autodesk.com/en/docs/acc/v1/reference/http/v1-files-export-pdf-files-POST/?utm_source=chatgpt.com "POST PDF File Export | Autodesk Construction Cloud APIs"
[2]: https://aps.autodesk.com/en/docs/acc/v1/reference/http/v1-files-export-status-and-result-GET?utm_source=chatgpt.com "GET Export Status | Autodesk Construction Cloud APIs"
[3]: https://aps.autodesk.com/en/docs/acc/v1/tutorials/files/upload-document-s3?utm_source=chatgpt.com "Upload Files to the ACC Files Tool"
[4]: https://github.com/autodesk-platform-services/aps-acc-sheet.api-postman.collection?utm_source=chatgpt.com "autodesk-platform-services/aps-acc-sheet.api-postman. ..."
[5]: https://aps.autodesk.com/blog/acc-api-export-2d-view-and-sheet-revit-or-dwg-pdf?utm_source=chatgpt.com "ACC API: Export 2D View and Sheet of Revit or DWG to PDF"
[6]: https://aps.autodesk.com/en/docs/design-automation/v3?utm_source=chatgpt.com "Overview | Automation API"
[7]: https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/How-to-export-views-and-sheets-to-PDF-from-Revit.html?utm_source=chatgpt.com "How to export views and sheets to PDF from Revit"
[8]: https://aps.autodesk.com/blog/design-automation-revit-2022-now-support-exporting-pdf-directly?utm_source=chatgpt.com "Automation API for Revit 2022 now support exporting to ..."
[9]: https://aps.autodesk.com/blog/export-pdf-revit-design-automation-sample?utm_source=chatgpt.com "Export PDF by Revit Automation sample"
[10]: https://github.com/autodesk-platform-services/aps-export-revit-pdf?utm_source=chatgpt.com "autodesk-platform-services/aps-export-revit-pdf ..."


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
---

## Domanda tre

i can avoid letting the user choose a specific acc output save folder. im ok with any zip or anything download button; i just thought the acc saving would led me to write less code, but it looks like its the opposite. please answer the initial question again, but with this new constraint. please avoid the uploading the output into acc if implies more coding effort. im also ok with using flex tokens.
i dont know if i would choose the DA4R approach vs the ACC "Export to PDF" approach; it looks like i have no incentive in using the DA4R since i have to spend flex tokens for having basically the same result (exported pdfs) tell me if there are any advantages in my case please. 



## Risposta tre

Got it—since you’re OK with a **download link** (no need to auto-save back into ACC) and you won’t export 3D, the **lowest-effort, fully-cloud** solution is:

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

# Should you use DA4R (Revit engine in the cloud)?

**You don’t need it** for plain “export selected sheets & floor plans to PDF and download ZIP.” DA4R spends **Flex tokens** and adds build/deploy of an app-bundle DLL. Use it only if you need any of these “power moves”:

* Custom file naming logic beyond what ACC provides; **per-sheet** overrides, folders, batching across many files.
* **Pre-export Revit API edits** (apply view templates, change parameters, set phases, turn categories on/off, apply print settings).
* **Watermarking/stamping** via title block or family edits before export.
* Handling models that don’t satisfy ACC export constraints (exotic cases).
* Doing additional outputs in the same run (DWG, DWF, images, schedules, etc.).

DA4R supports **direct PDF export from Revit 2022+** (your bundle would call `Document.Export(..., new PDFExportOptions { ... })`). But if you don’t need the above, stick to ACC Files export and avoid token spend + extra code. ([Autodesk Platform Services][5])

---

## TL;DR recommendation

* **Pick ACC Files → “Export to PDF”** now. It’s the **least code** and returns a ready **download link**—perfect for your UI. ([Autodesk Platform Services][1])
* Keep **DA4R** in your back pocket for advanced, parameterized workflows later. ([Autodesk Platform Services][5])

If you want, I can tailor a **ready POST body + polling code** that matches the exact selection JSON your app already emits (your view/sheet structure and version URNs).

[1]: https://aps.autodesk.com/en/docs/acc/v1/reference/http/v1-files-export-pdf-files-POST/?utm_source=chatgpt.com "POST PDF File Export | Autodesk Construction Cloud APIs"
[2]: https://aps.autodesk.com/en/docs/acc/v1/reference/http/v1-files-export-status-and-result-GET?utm_source=chatgpt.com "GET Export Status | Autodesk Construction Cloud APIs"
[3]: https://aps.autodesk.com/en/docs/acc/v1/tutorials/files/export-pdf-files?utm_source=chatgpt.com "Export Files from the ACC Files Tool"
[4]: https://aps.autodesk.com/blog/acc-api-export-2d-view-and-sheet-revit-or-dwg-pdf?utm_source=chatgpt.com "ACC API: Export 2D View and Sheet of Revit or DWG to PDF"
[5]: https://aps.autodesk.com/blog/design-automation-revit-2022-now-support-exporting-pdf-directly?utm_source=chatgpt.com "Automation API for Revit 2022 now support exporting to ..."







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
---

## Domanda quattro

still evaluating both approaches. last question. im choosing many Floor plans, Sheets from multiple revit files. i can have a list of multiple floorplans+sheets, like even 50 or 100, from multiple revit files. if i would print this list, to get a single download link with a zip file (or multiple links, i dont care) with approach 1 that doesnt spend flex tokens, it would be advantageous to me since it would be basically free. approach 2 (DA4R) is more powerful and free, but costs. im ok with paying but only if i dont have a free alternative. what do you suggest? also are you sure approach one doesnt cost tokens? for example: maybe the v1/files:export-pdf-files API is free but a translation is mandatory? my files are not translated at all. i see the floor plans and sheets without translating each file. if i need to translate them, it would still cost tokens and that means i have to take approach 2 for sure. what do you think?

## Risposta quattro

Short answer: **Use ACC “Export to PDF.”** It’s cloud-side, handles **many sheets/floor plans across multiple RVT files**, returns you **one ZIP download link per job**, and **doesn’t spend Flex tokens**. You only need tokens if you go with **Design Automation for Revit (DA4R)** or if you run **Model Derivative translations** (the *translate* POST job is the billed one). Details below.

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
 