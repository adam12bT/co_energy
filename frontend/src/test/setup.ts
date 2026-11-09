import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(()=>cleanup());
class ResizeObserverMock {
  constructor(private callback:ResizeObserverCallback){}
  observe(target:Element){this.callback([{target,contentRect:{width:800,height:240}} as ResizeObserverEntry],this as unknown as ResizeObserver);}
  unobserve(){} disconnect(){}
}
globalThis.ResizeObserver=ResizeObserverMock as unknown as typeof ResizeObserver;
Object.defineProperty(HTMLElement.prototype,'getBoundingClientRect',{configurable:true,value(){return {width:800,height:240,top:0,left:0,bottom:240,right:800,x:0,y:0,toJSON(){}};}});
if(!HTMLDialogElement.prototype.showModal)HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
if(!HTMLDialogElement.prototype.close)HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
