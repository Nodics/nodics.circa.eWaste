import '@testing-library/jest-dom/vitest';
// jsdom does not implement the browser's native dialog presentation APIs.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
}
