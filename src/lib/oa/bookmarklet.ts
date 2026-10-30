/**
 * Bookmarklet that runs on hub.outdooranalytics.com.
 *
 * It does not fetch Desk. A cross-origin fetch would be a CORS write, and the
 * Desk session cookie is SameSite=Lax so it would not be sent. Instead the
 * bookmarklet opens a same-site Desk window (top-level navigation, so the
 * cookie is sent) and delivers the token with postMessage. The token is never
 * placed in a URL.
 */

import { deskPublicOrigin, isLoopbackOrigin, oaSessionStorageKey } from "@/lib/oa/config";

export interface BookmarkletOptions {
  deskOrigin: string;
  storageKey: string;
  allowInsecureLoopback: boolean;
}

export function bookmarkletOptionsFromEnv(): BookmarkletOptions {
  const deskOrigin = deskPublicOrigin();
  return {
    deskOrigin,
    storageKey: oaSessionStorageKey(),
    allowInsecureLoopback: isLoopbackOrigin(deskOrigin),
  };
}

export function buildOaBookmarkletHref(opts: BookmarkletOptions = bookmarkletOptionsFromEnv()): string {
  return `javascript:${buildOaBookmarkletSource(opts)}`;
}

export function buildOaBookmarkletSource(opts: BookmarkletOptions): string {
  const origin = opts.deskOrigin;
  if (!/^https?:\/\/[A-Za-z0-9._:-]+$/.test(origin)) {
    throw new Error("Desk origin is not safe to embed in the bookmarklet.");
  }
  if (!/^https:\/\//.test(origin) && !(opts.allowInsecureLoopback && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin))) {
    throw new Error("Bookmarklet Desk origin must be HTTPS (http is only allowed on loopback).");
  }
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(opts.storageKey)) {
    throw new Error("OA session storage key is not safe to embed.");
  }

  const desk = JSON.stringify(origin);
  const key = JSON.stringify(opts.storageKey);
  const allowHttp = opts.allowInsecureLoopback ? "true" : "false";

  return `(function(){var DESK=${desk};var KEY=${key};var ALLOW_HTTP=${allowHttp};function show(msg,ok){var id="desk-oa-connect-banner";var el=document.getElementById(id);if(!el){el=document.createElement("div");el.id=id;el.setAttribute("role","status");el.style.cssText="position:fixed;z-index:2147483647;top:12px;left:12px;right:12px;max-width:560px;margin:0 auto;padding:14px 16px;border-radius:8px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)";(document.body||document.documentElement).appendChild(el);}el.style.background=ok?"#14532d":"#7f1d1d";el.style.color="#fff";el.textContent=msg;}try{var u=new URL(DESK);var loop=u.hostname==="localhost"||u.hostname==="127.0.0.1"||u.hostname==="::1";if(u.protocol!=="https:"&&!(ALLOW_HTTP&&loop&&u.protocol==="http:")){show("Connect OA refused: Desk origin must be HTTPS.",false);return;}}catch(e){show("Connect OA refused: Desk origin is not a valid URL.",false);return;}var token=null;try{token=sessionStorage.getItem(KEY);}catch(e){token=null;}if(!token){show("Sign in to Outdoor Analytics first, then click Connect OA again.",false);return;}var popup=window.open(DESK+"/oa-connect","deskOaConnect","width=480,height=640");if(!popup){show("Desk popup was blocked. Allow popups for this site and click Connect OA again.",false);return;}show("Sending the OA session to your Desk…",true);var done=false;function onMsg(ev){if(ev.origin!==DESK)return;var data=ev.data;if(!data||data.type!=="desk-oa-token-result")return;done=true;window.removeEventListener("message",onMsg);show(data.ok?(data.message||"OA connected to Desk."):(data.message||"OA connect failed."),!!data.ok);}window.addEventListener("message",onMsg);var tries=0;var timer=setInterval(function(){if(done){clearInterval(timer);return;}if(popup.closed){clearInterval(timer);window.removeEventListener("message",onMsg);if(!done)show("Desk window closed before the token was saved.",false);return;}tries++;if(tries>200){clearInterval(timer);window.removeEventListener("message",onMsg);show("Timed out waiting for Desk. Sign in to Desk in the popup, then click Connect OA again.",false);return;}try{popup.postMessage({type:"desk-oa-token",token:token},DESK);}catch(e){}},300);})();`;
}
