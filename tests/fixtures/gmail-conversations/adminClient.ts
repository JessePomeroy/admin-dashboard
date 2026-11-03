import { fixture } from "./state.svelte";
export function useAdminClient(){return {mutation:async(name:string,args:Record<string,unknown>)=>{
 fixture.calls.push({name,args});
 if(name==="create") return "thread1";
 if(name==="saveDraft"){
  if(fixture.failSave)throw new Error("Synthetic save failure");
  fixture.detail.draft={text:String(args.text),revision:fixture.detail.draft.revision+1,attachments:fixture.detail.draft.attachments.filter(f=>(args.attachmentIds as string[]).includes(f._id))};
  sessionStorage.setItem("fixture-draft",JSON.stringify(fixture.detail.draft)); return fixture.detail.draft.revision;
 }
 if(name==="reserveAttachment"){
  const attachmentId="pending-"+Date.now();fixture.detail.draft.attachments.push({_id:attachmentId,name:String(args.name),size:Number(args.size),type:String(args.type),sha256:String(args.sha256),status:"pending"});
  fixture.detail.draft.revision++; sessionStorage.setItem("fixture-draft",JSON.stringify(fixture.detail.draft)); return{attachmentId,revision:fixture.detail.draft.revision};
 }
 if(name==="queueSend")fixture.detail.attempt={_id:"attempt1",status:"uncertain",problem:"Send outcome is uncertain. Check Gmail Sent before any further action."};
 if(name==="setWorkflow"){fixture.detail.conversation.workflowState=String(args.state) as typeof fixture.detail.conversation.workflowState;fixture.detail.conversation.followUpAt=typeof args.followUpAt==="number"?args.followUpAt:undefined;fixture.detail.conversation.revision++;}
 if(name==="reconcile" && fixture.detail.attempt){fixture.detail.attempt.checkedAt=Date.now();fixture.detail.attempt.checkOutcome="not_found";}
 if(name==="restartRecovery") fixture.detail.mailbox!.recovering=true;
 if(name==="deleteMailboxData") fixture.hasData=false;
 if(name==="requestDeletion") fixture.hasData=false;
 if(name==="requestSync")fixture.detail.mailbox!.lastSyncAt=Date.now();
 return null;
}};}
