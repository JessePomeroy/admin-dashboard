import { writable } from "svelte/store";
import type { AdminAuthClient, SessionStoreValue } from "../../../src/lib/config";
export const requests: Parameters<NonNullable<AdminAuthClient["linkSocial"]>>[0][] = [];
const scenario = new URL(location.href).searchParams.get("state");
const session = writable<SessionStoreValue>({data:{user:{email:"owner@example.test"}},isPending:false});
const authClient: AdminAuthClient = {
 useSession:()=>session, signIn:{email:async()=>({error:null}),social:async()=>({error:null})},signUp:{email:async()=>({error:null})},signOut:async()=>{},
 listAccounts:async()=>({data:scenario==="unlinked"?[]:[{providerId:"google"}]}),
 linkSocial:async input=>{requests.push(input); return {error:{message:"Local consent canceled; no Google request sent."}};},
};
const gmailConversations = Object.fromEntries(["connection","list","detail","messages","create","saveDraft","reserveAttachment","retryAttachment","queueSend","requestSync","reconcile","queue","setWorkflow","restartRecovery","requestDeletion","dataStatus","deleteMailboxData"].map(name=>[name,name]));
export function getAdminConfig(){return {siteName:"angels rest",siteUrl:"example.test",fromEmail:"owner@example.test",isCreator:false,api:{gmailConversations,inquiries:{},siteEditor:{}},editor:{siteSettings:true},authClient,gmail:{endpoint:"/api/admin/gmail",linking:true,correspondencePath:"/admin/correspondence"}};}
