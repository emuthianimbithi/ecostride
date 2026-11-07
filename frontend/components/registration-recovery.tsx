"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { apiPost } from "../lib/api-client"

type Recovery={registration_slug:string;athlete_name:string;event_title:string;next_action:"retry_payment"|"view_payment"|"view_ticket"|"contact_support";payment_id?:string}
export function RegistrationRecovery(){
 const router=useRouter()
 const [token,setToken]=useState(""),[entry,setEntry]=useState<Recovery|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("")
 const sending=useRef(false),paymentKey=useRef("")
 useEffect(()=>{const read=()=>{setToken(new URLSearchParams(window.location.hash.slice(1)).get("token")??"");setEntry(null);setError("");paymentKey.current=""};read();window.addEventListener("hashchange",read);return()=>window.removeEventListener("hashchange",read)},[])
 const verify=async()=>{
  if(sending.current||!token)return;sending.current=true;setBusy(true);setError("")
  try{const data=await apiPost<Recovery>("/public/registrations/recover/verify",{token});setEntry(data);setToken("");window.history.replaceState(null,"","/registration-recovery")}
  catch(err){setError(err instanceof Error?err.message:"Unable to verify your link. Please request a new one.")}
  finally{sending.current=false;setBusy(false)}
 }
 const continuePayment=async()=>{
  if(!entry||sending.current)return;sending.current=true;setBusy(true);setError("")
  if(!paymentKey.current)paymentKey.current=crypto.randomUUID()
  try{const data=await apiPost<{payment_id:string;checkout_url?:string}>("/public/payments/pesapal/checkout",{registration_slug:entry.registration_slug,currency:"KES"},{headers:{"X-Idempotency-Key":paymentKey.current}});router.push(`/payment/${data.payment_id}${data.checkout_url?"/checkout":""}`)}
  catch(err){setError(err instanceof Error?err.message:"Unable to open checkout. Please try again.")}
  finally{sending.current=false;setBusy(false)}
 }
 const button="inline-flex rounded-full bg-forest px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
 return <main className="mx-auto max-w-xl space-y-6 px-5 py-14">
  <h1 className="font-display text-3xl text-forest">Continue your registration</h1>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
  {!entry&&<>
   <p className="text-muted-foreground">Verify your email link to view your existing entry. This won’t charge you or register you twice.</p>
   {token?<button className={button} disabled={busy} onClick={verify}>{busy?"Verifying…":"Verify and continue"}</button>:<p className="text-sm">Open the secure link from your email. Used or expired links require a new email from the event registration page.</p>}
  </>}
  {entry&&<section className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6">
   <h2 className="text-xl font-semibold text-forest">{entry.event_title}</h2><p>{entry.athlete_name}</p>
   {entry.next_action==="view_ticket"&&<><p>Your entry is already confirmed.</p><a className={button} href={`/confirm/${entry.registration_slug}`}>View your race ticket</a></>}
   {entry.next_action==="view_payment"&&entry.payment_id&&<><p>Your payment is still being checked or has a recorded outcome. Review it before paying again.</p><a className={button} href={`/payment/${entry.payment_id}/checkout`}>View existing payment</a></>}
   {entry.next_action==="retry_payment"&&<><p>Your registration is saved. Continue with PesaPal to complete payment; we won’t create another entry.</p><button className={button} disabled={busy} onClick={continuePayment}>{busy?"Opening checkout…":"Continue payment"}</button></>}
   {entry.next_action==="contact_support"&&<><p>This entry needs a review before another payment. Please contact the team.</p><a className={button} href="/contact">Contact support</a></>}
  </section>}
  <a href="/events" className="inline-block font-semibold text-forest underline">Browse events</a>
 </main>
}
