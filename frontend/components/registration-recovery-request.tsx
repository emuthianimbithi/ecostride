"use client"
import { useEffect, useState } from "react"
import { apiPost } from "../lib/api-client"

export function RegistrationRecoveryRequest({eventSlug,initialEmail="",forceOpen=false}:{eventSlug:string;initialEmail?:string;forceOpen?:boolean}){
 const [email,setEmail]=useState(initialEmail),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("")
 useEffect(()=>setEmail(initialEmail),[initialEmail])
 return <details open={forceOpen||undefined} className="rounded-2xl border border-sand-200 bg-sand-50 p-5">
  <summary className="cursor-pointer font-semibold text-forest">Already started or payment failed? Continue your registration</summary>
  <p className="mt-3 text-sm text-muted-foreground">Use the email you registered with. We’ll email a secure link to your existing entry.</p>
  <form className="mt-4 flex flex-wrap gap-3" onSubmit={async e=>{
   e.preventDefault();if(busy)return;setBusy(true);setError("");setMessage("")
   try{const result=await apiPost<{message:string}>("/public/registrations/recover",{event_slug:eventSlug,email:email.trim().toLowerCase()});setMessage(result.message)}
   catch(err){setError(err instanceof Error?err.message:"Unable to request the link. Please try later.")}
   finally{setBusy(false)}
  }}>
   <label className="min-w-0 flex-1 text-sm">Registration email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-sand-300 px-3 py-2" autoComplete="email"/></label>
   <button disabled={busy} className="self-end rounded-full bg-forest px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?"Requesting link…":"Email me a secure link"}</button>
  </form>
  {message&&<p role="status" className="mt-3 text-sm text-forest">{message}</p>}
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
 </details>
}
