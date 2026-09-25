# Shop overtime canvas — first version

## Getting started

The app begins with 46 fictional Sample Workers. Open **Workers** and edit each record to match your shop's paper roster. Enter starting hours and unique seniority numbers; both `P100` and `100P` identify a provisional worker. Mark unused sample records inactive if your roster is smaller.

Review actual regular nights carefully. A checked day means the regular shift **starts at 10 p.m. that night** and ends at 6 a.m. the next morning. Default Friday–Saturday RDO workers start regular work Saturday through Wednesday nights. Default Sunday–Monday RDO workers start Monday through Friday nights. Dated exceptions use one line per date: `2026-09-19 off` or `2026-09-19 work`. All dates and times use America/New_York, including daylight-saving changes.

## Weekly workflow

1. **Review adjustments.** Import any prior assignment that is not already recorded, using a unique paper reference. If its original eight hours are already in the worker's starting total, leave the already-included option checked. This moves those eight hours into a linked charge without increasing the total. Record call-outs, notice time, reason, and any replacement who actually worked. The replacement has a separate already-included checkbox. Click **Apply adjustments & continue** before starting the next canvas.
2. **Set up overtime.** Choose the Friday of the weekend, enter one chip-out location per line, and enable the banks shifts that are available. Each location receives two openings per chip-out shift; each banks shift receives eighteen. Click **Create canvas**.
3. **Canvas.** Check the paper preference for the displayed worker. Choose an open location and click **Accept**, or click **Refuse**. Each response adds eight ranking hours and recalculates the entire eligible order. A refusal is charged only when the offer actually reaches an eligible worker, once per work-type/shift. Use **Undo last response** for an accidental action.
4. **Fill shortages and review results.** When no local candidates remain, record the shortage. In Results, any position that still shows **Coverage needed** can be marked **Filled by outside worker** as soon as that outside coverage is actually secured; the shift does not have to be formally closed first. No outside names or hours are stored, and existing local responses remain intact. All chip-out positions must be covered before remaining banks proceed. Results lists every date, shift, location, assignment, remaining position, and worker total. Use **Print canvas & totals** for a paper or PDF copy.

## Corrections and cancellations

- In **Workers → Edit**, change **Current overtime hours** to the desired total and save. Increases and decreases create a **Correction** ledger entry for the difference and a before/after History record. Starting hours and all previous records are preserved. Saving the same total adds no correction. The corrected total is used immediately for canvassing order.

- **Not here**, beside the next worker’s name, skips that worker for every remaining shift in the current canvas, without adding or subtracting any hours. The mark is saved through refreshes and restarts and does not carry into a different canvas. Earlier assignments and charges remain recorded. Use **Undo last action** immediately, or **Undo not here** in the canvas’s Not here list, to correct an accidental click. The worker then returns in normal hours-and-seniority order.

- **Find available worker** in Results lists every eligible worker for that open location, whether present on canvas night, marked Not Here, or previously refusing. Order is current hours, employment status, then seniority. Assigning adds eight replacement hours and retains earlier responses. When filling a call-out, it links the replacement response and charge to that absence; already-recorded replacement declines remain excluded. Normal RDO, work/rest, inactive-worker, and duplicate-assignment checks still apply.
- **Correct** on a response can reverse an erroneous entry or replace it with the correct acceptance/refusal. An acceptance must still pass the work/rest checks and use an open location. Existing later assignments remain in place; review alerts identify the changed context.
- **Location** moves an acceptance to another open location on the same shift without adding hours.
- **Call-out** retains the original eight. Notice of at least four hours adds no penalty. Less notice or no notice queues eight additional hours for the next canvas review. A call-out is not a cancellation of work.
- **Correct** on an absence restores the original assignment and reverses the penalty and any replacement entry created with that absence. Record a corrected call-out afterward if needed. If another assignment now occupies the opening, correct that coverage first.
- **Cancel selected events** previews affected workers and hour changes before applying. Cancellation reverses all charges tied to the canceled events, including applied absence penalties, and cancels queued penalties.
- **Cancel opening** reduces required staffing by one. On an assigned or called-out position it reverses that assignment's linked charges, penalty, and replacement. Refusals remain linked to the shift while other work remains; canceling the final opening reverses all remaining shift charges.
- After a roster correction makes local workers eligible for a previously closed shortage, use **Reopen local offers** in Results. Existing responses remain recorded.
- Imported prior events also have cancellation and correction controls in Review adjustments.

History retains every response, adjustment, correction, and cancellation. Reversals are additional ledger entries, not erased charges. Review schedule-conflict alerts after changing a regular schedule or earlier decision. The app never silently moves communicated assignments.

## Paper-sheet total reconciliation

After the Sept. 18–21 paper sheets are finalized, open **Workers** and use **Match Sept. 21 sheet totals**. The preview compares each worker's current ledger total with the far-right **TOTAL** column from the paper sheets. Confirming the action keeps the original starting balances and all existing canvas history, then records only the differences as audited **Correction** entries so Current hours exactly match the paper totals. The action is one-time for this sheet set. A. Majer is excluded from the 42-worker roster, and A. Raffee remains 300P with a paper total of 664.

## Saving and scope

Every completed action saves to the app's database. Refreshing, closing the browser, or restarting the app does not discard a saved canvas. Unsaved form input is not a saved action. If two windows try to save different actions at once, the later request is rejected and asks the operator to reload. A failed save leaves the previous records intact and displays an error.

This version is a single-shop operator tool. There are no employee accounts, preference forms, or messages. The hosted app uses private site access. Local development and the hosted app have separate databases; local verification records are not published.

All five policy questions are resolved by your answers. Ranking uses hours, permanent before provisional, then ascending unique seniority. Refusal and penalty hours do not count as work. Actual regular work, accepted overtime, and replacements are checked together for overlap, more than sixteen consecutive hours, and the required eight-hour break after sixteen hours, including work before and after each offer.

## Local setup from source

Requires Node.js 22.13 or newer. From the source folder:

```sh
npm run install:ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_boring_reptil.sql
npm run dev
```

Apply the migration once for a new local database. Then open the Local URL printed by the server, normally `http://localhost:5173/`. Later launches only need `npm run dev`. Keep `.wrangler/state` to retain local records. Stop the server with Ctrl+C. Run `node --experimental-strip-types --test tests/engine.test.ts` for rule tests and `npx tsc --noEmit` for type validation.

The app uses React/Vinext, a server-validated command endpoint, and SQLite-compatible D1 persistence with revision checks. Source and tests are included for future maintenance.

### Editable canvas hours

In **Canvas sheets**, click a worker’s shift charge, choose **Add hours** or **Take away hours**, enter the amount and a reason, and save. The correction updates running balances, current totals across the app, and the PDF immediately after saving. History retains the correction; starting hours and coverage assignments are preserved. Enable **Show all canvas shifts** to adjust another RDO date. Canceled shifts are read-only.

Canceled shift cells display returned hours (for example **-8**, or **-16** when sixteen posted hours are reversed), while running balances use net ledger charges. New cancellations record the amount returned at cancellation, excluding older corrections already reversed. Older canceled records without that snapshot use the final consecutive reversal batch in original-charge order, excluding earlier undo/reaccept cycles. Old records do not store operation IDs, so adjacent legacy reversals without an intervening charge or an order boundary cannot always be separated; new cancellation snapshots avoid that ambiguity.
