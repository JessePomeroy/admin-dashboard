import type { GmailDetail, GmailMessage } from "../../../src/lib/pages/gmail/types";
const time = Date.now();
const mailbox = {address:"owner@example.test",status:"connected" as const,lastSyncAt:time,watchExpiresAt:time+86400000,problem:null,recovering:false};
export const fixture = $state({
 detail:{conversation:{_id:"thread1",recipient:"guest@example.test",subject:"Portrait session",revision:2,threadId:"provider-thread",workflowState:"needs_reply"},mailbox,recipientChanged:false,expiresAt:time+30*86400000,
 policy:{fileBytes:3145728,messageFileBytes:6291456,files:5,bodyCharacters:32000,staleAfterMs:120000},draft:{text:"",revision:0,attachments:[]},attempt:null} as GmailDetail,
 messages:[{_id:"message2",providerId:"gm2",rfcId:"<gm2@example.test>",from:mailbox.address,text:"Hello Alex, Tuesday works for me.\n\nOn Monday Alex wrote:\n> Earlier request, kept in full.\n-- \nSynthetic photographer signature",sent:true,date:time-40000,origin:"gmail",attachments:[]},
 {_id:"message1",providerId:"gm1",from:"guest@example.test",text:'Hi! Can we arrange a portrait session?\n<img src=x onerror="window.mailExecuted=true">',sent:false,date:time-80000,origin:"gmail",attachments:[{_id:"file1",name:"reference.pdf",type:"application/pdf",size:1024,status:"ready"}]}] as GmailMessage[],
 failSave:false,queueError:false,hasData:true,calls:[] as {name:string;args:Record<string,unknown>}[],configured:true,
});
export function useQuery(ref:string){return { get data(){return ref==="connection"?{mailbox:fixture.detail.mailbox}:ref==="dataStatus"?{hasData:fixture.hasData,holds:fixture.detail.attempt?.status==="uncertain"?[{conversationId:"thread1",status:"uncertain"}]:[],deleting:false,lastDeletedAt:fixture.hasData?null:Date.now()}:fixture.detail;},get error(){return undefined;},isLoading:false};}
export function usePaginatedQuery(ref:string,args?:()=>{state?:string}){return {get results(){
 if(ref==="queue") {const c=fixture.detail.conversation; return fixture.hasData && (!args?.().state || args().state===c.workflowState)?[{...c,inquiryId:"inquiry1",clientId:"client1",state:c.workflowState??"review",followUpAt:c.followUpAt??null,problem:c.problem??null,importPending:false,retentionHold:false,incoming:{text:fixture.messages.find(m=>!m.sent)?.text??"",date:Date.now(),from:"guest@example.test"}}]:[];}
 return ref==="list"?[fixture.detail.conversation]:fixture.messages;
 },status:"Exhausted",get error(){return ref==="queue"&&fixture.queueError?new Error("Synthetic query failure"):undefined;},loadMore(){}};}
export function pushNative(){fixture.messages.unshift({_id:"message"+Date.now(),providerId:"gm"+Date.now(),from:"guest@example.test",text:"Thank you — received from Gmail without a refresh.",sent:false,date:Date.now(),origin:"gmail",attachments:[]});fixture.detail.conversation.revision++;fixture.detail.conversation.workflowState="review";}
