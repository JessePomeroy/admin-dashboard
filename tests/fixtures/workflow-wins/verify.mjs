import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import {chromium} from "playwright";
const output=resolve(process.env.WORKFLOW_VISUAL_OUTPUT ?? "/tmp/workflow-wins-visuals");await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 for(const viewport of [{width:1280,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,reducedMotion:"reduce"});const page=await context.newPage();const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("http://127.0.0.1:5276");await page.getByText("INV-001",{exact:true}).waitFor();
  await page.getByRole("button",{name:"next",exact:true}).click();await page.evaluate(()=>window.workflowFixture.respond());await page.getByText("INV-003",{exact:true}).waitFor();
  await page.getByLabel("search invoices").fill("old");await page.evaluate(()=>window.workflowFixture.respond());assert.equal(await page.evaluate(()=>window.workflowFixture.request.paginationOpts.cursor),null);
  await page.getByRole("button",{name:"open older invoice",exact:true}).click();await page.getByLabel("Opened record").filter({hasText:"INV-OLD"}).waitFor();
  await page.getByRole("button",{name:"export matching records",exact:true}).click();await page.getByLabel("Exported count").filter({hasText:"201"}).waitFor();
  await page.getByRole("button",{name:"retry owner notification",exact:true}).click();await page.getByText("queued for delivery",{exact:false}).waitFor();
  await page.getByRole("button",{name:"start draft schedule",exact:true}).click();await page.getByRole("button",{name:"pause schedule",exact:true}).waitFor();
  await page.getByRole("button",{name:"pause schedule",exact:true}).click();await page.getByRole("button",{name:"resume · skip missed dates",exact:true}).waitFor();
  await page.screenshot({path:resolve(output,`workflow-${viewport.width}.png`),fullPage:true});
  await page.getByRole("button",{name:"recover stored file",exact:true}).click();await page.getByText("Recovered synthetic-portrait-original.jpg.",{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  console.log(`PASS ${viewport.width}px: pagination, filter reset, exact ID, 201-record export, notification retry, schedule start/pause, verified original recovery; no page errors or overflow`);await context.close();
 }
}finally{await browser.close();}
