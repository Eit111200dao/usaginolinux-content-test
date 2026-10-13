// Application response RTT: includes the response body, excludes guest rendering.
export async function measureRoundTrip(url,{timeoutMs=3000,signal,fetcher=globalThis.fetch,now=()=>performance.now()}={}) {
  const controller=new AbortController();
  const abort=()=>controller.abort();
  if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,timeoutMs),started=now();
  try {
    const response=await fetcher(url,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error('Latency endpoint unavailable');
    await response.arrayBuffer();
    return Math.max(0,now()-started);
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

export function startLatencyMonitor({url,enabled=()=>true,onUpdate,intervalMs=3000,timeoutMs=3000}) {
  let stopped=false,timer,controller;
  async function tick() {
    if(stopped)return;
    if(!enabled()){onUpdate({state:'idle'});timer=setTimeout(tick,intervalMs);return;}
    controller=new AbortController();
    try {const ms=await measureRoundTrip(url,{timeoutMs,signal:controller.signal});if(!stopped)onUpdate({state:'ready',ms});}
    catch(error){if(!stopped)onUpdate({state:error.name==='AbortError'?'timeout':'error'});}
    finally {controller=null;if(!stopped)timer=setTimeout(tick,intervalMs);}
  }
  void tick();
  return ()=>{stopped=true;clearTimeout(timer);controller?.abort();};
}
