export const trackpadMarkup=`<section id="trackpad-panel" aria-label="スマホ操作">
<div class="pad-toolbar"><button type="button" data-pad-click="1">左クリック</button><button type="button" data-pad-click="4">右クリック</button><button type="button" data-pad-drag aria-pressed="false">ドラッグ</button><button type="button" data-pad-keyboard>キーボード</button></div>
<div id="touchpad" role="group" aria-label="トラックパッド" tabindex="0"><strong>トラックパッド</strong><small>指でカーソル移動 · タップでクリック<br>2本指でスクロール／2本指タップで右クリック</small></div>
<form id="mobile-keyboard" hidden><label>Linuxに送る文字<input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="2048"></label><button type="submit">送信</button><div class="pad-keys"><button type="button" data-pad-key="65293">Enter</button><button type="button" data-pad-key="65288">⌫</button><button type="button" data-pad-key="65289">Tab</button><button type="button" data-pad-key="65307">Esc</button></div></form>
</section>`;
export class TrackpadController {
  constructor({size,send,scale=()=>1,position=()=>null,onPosition=()=>{},onDrag=()=>{},now=()=>performance.now()}) {
    Object.assign(this,{size,send,scale,onPosition,onDrag,now});this.points=new Map();this.dragging=false;this.gesture=null;
    const initial=position();this.x=initial?.x??null;this.y=initial?.y??null;this.scroll=0;
  }
  point() {
    const {width,height}=this.size();if(!width||!height)return null;
    this.x=Math.max(0,Math.min(width-1,this.x??width/2));this.y=Math.max(0,Math.min(height-1,this.y??height/2));
    return {x:this.x,y:this.y,width,height};
  }
  emit(mask=this.dragging?1:0) {const p=this.point();if(p){this.send(p.x,p.y,mask);this.onPosition(p);}}
  centroid(){const points=[...this.points.values()];return points.reduce((sum,p)=>sum+p.y,0)/points.length;}
  down(id,x,y) {
    if(!this.points.size)this.gesture={at:this.now(),max:1,moved:false};
    this.points.set(id,{x,y,startX:x,startY:y});this.gesture.max=Math.max(this.gesture.max,this.points.size);this.scroll=0;this.emit();
  }
  move(id,x,y) {
    const old=this.points.get(id);if(!old)return;const before=this.centroid(),dx=x-old.x,dy=y-old.y;
    if(Math.hypot(x-old.startX,y-old.startY)>6)this.gesture.moved=true;
    this.points.set(id,{...old,x,y});
    if(this.points.size===1&&this.gesture.max===1){if(!this.point())return;this.x+=dx*this.scale();this.y+=dy*this.scale();this.emit();}
    else if(this.points.size===2){this.scroll+=this.centroid()-before;while(Math.abs(this.scroll)>=18){const direction=Math.sign(this.scroll);this.emit((this.dragging?1:0)|(direction>0?8:16));this.emit();this.scroll-=direction*18;}}
  }
  up(id) {
    if(!this.points.has(id))return;this.points.delete(id);
    if(!this.points.size){if(!this.dragging&&this.gesture.max<=2&&!this.gesture.moved&&this.now()-this.gesture.at<350)this.click(this.gesture.max===2?4:1);this.gesture=null;this.scroll=0;}
  }
  click(button=1){this.emit((this.dragging?1:0)|button);this.emit();}
  drag(enabled){this.dragging=enabled;this.emit();this.onDrag(enabled);}
  cancel(){this.points.clear();this.gesture=null;this.scroll=0;this.drag(false);}
}

export function installTrackpad({dialog,rfb}) {
  const pad=dialog.querySelector('#touchpad'),screen=dialog.querySelector('#console-screen'),marker=dialog.querySelector('#remote-pointer'),dragButton=dialog.querySelector('[data-pad-drag]'),toggle=dialog.querySelector('#trackpad-toggle');
  const disposers=[];let enabled=false;
  function on(target,event,fn,options){target.addEventListener(event,fn,options);disposers.push(()=>target.removeEventListener(event,fn,options));}
  const model=new TrackpadController({size:()=>rfb.desktopSize,position:()=>rfb.pointerPosition,send:(x,y,mask)=>rfb.sendPointer(x,y,mask),
    scale:()=>{const canvas=screen.querySelector('canvas');return canvas?.clientWidth?Math.max(1,rfb.desktopSize.width/canvas.clientWidth):1;},
    onDrag:value=>{dragButton.setAttribute('aria-pressed',String(value));dragButton.textContent=value?'ドラッグ：オン':'ドラッグ';},
    onPosition:point=>{const canvas=screen.querySelector('canvas');if(!enabled||!canvas){marker.hidden=true;return;}const a=canvas.getBoundingClientRect(),b=screen.getBoundingClientRect();marker.hidden=false;marker.style.left=(a.left-b.left+point.x/point.width*a.width)+'px';marker.style.top=(a.top-b.top+point.y/point.height*a.height)+'px';}
  });
  function setMode(value){model.cancel();enabled=value;rfb.resizeSession=!value;dialog.classList.toggle('trackpad-mode',value);toggle.setAttribute('aria-pressed',String(value));marker.hidden=!value;if(value)model.emit();}
  setMode(matchMedia('(pointer: coarse), (max-width: 800px)').matches);
  on(toggle,'click',()=>setMode(!enabled));
  on(pad,'pointerdown',event=>{if(!enabled)return;event.preventDefault();pad.setPointerCapture(event.pointerId);model.down(event.pointerId,event.clientX,event.clientY);});
  on(pad,'pointermove',event=>{if(!enabled)return;event.preventDefault();model.move(event.pointerId,event.clientX,event.clientY);});
  on(pad,'pointerup',event=>{event.preventDefault();model.up(event.pointerId);if(pad.hasPointerCapture(event.pointerId))pad.releasePointerCapture(event.pointerId);});
  on(pad,'pointercancel',()=>model.cancel());
  on(pad,'contextmenu',event=>event.preventDefault());
  on(dragButton,'click',()=>model.drag(!model.dragging));
  for(const button of dialog.querySelectorAll('[data-pad-click]'))on(button,'click',()=>model.click(Number(button.dataset.padClick)));
  const keyboard=dialog.querySelector('#mobile-keyboard');
  on(dialog.querySelector('[data-pad-keyboard]'),'click',()=>{keyboard.hidden=!keyboard.hidden;if(!keyboard.hidden)keyboard.querySelector('input').focus();});
  on(keyboard,'submit',event=>{event.preventDefault();const input=keyboard.querySelector('input');for(const char of input.value){const code=char.codePointAt(0);rfb.sendKey(code<=255?code:0x01000000+code);}input.value='';});
  for(const button of dialog.querySelectorAll('[data-pad-key]'))on(button,'click',()=>rfb.sendKey(Number(button.dataset.padKey)));
  on(window,'blur',()=>model.cancel());on(document,'visibilitychange',()=>{if(document.hidden)model.cancel();});
  const observer=new ResizeObserver(()=>{if(enabled){const point=model.point();if(point)model.onPosition(point);}});observer.observe(screen);
  return {refresh:()=>{if(enabled)model.emit();},destroy:()=>{model.cancel();observer.disconnect();for(const dispose of disposers)dispose();dialog.classList.remove('trackpad-mode');marker.hidden=true;keyboard.hidden=true;}};
}
