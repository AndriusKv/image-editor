!function(e){function n(r){if(t[r])return t[r].exports;var o=t[r]={i:r,l:!1,exports:{}};return e[r].call(o.exports,o,o.exports,n),o.l=!0,o.exports}var t={};n.m=e,n.c=t,n.i=function(e){return e},n.d=function(e,t,r){n.o(e,t)||Object.defineProperty(e,t,{configurable:!1,enumerable:!0,get:r})},n.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return n.d(t,"a",t),t},n.o=function(e,n){return Object.prototype.hasOwnProperty.call(e,n)},n.p="",n(n.s=31)}({31:function(e,n){function t(e,n,t){i.folder("images").file(e+"."+t,n,{base64:!0})}function r(e){return"jpeg"!==e?e:"jpg"}function o(e,n){return 4===n.length?e.slice(23):e.slice(22)}function a(e,n){var a=r(e.type),i=o(e.uri,a);t(e.name+n,i,a)}importScripts("./libs/jszip.min.js");var i=new JSZip,s=null,c=0;self.onmessage=function(e){var n=e.data;switch(n.action){case"add":a(n.image,c),c+=1;break;case"add-bulk":n.images.forEach(a);break;case"generate":c=0,Object.keys(i.files).length&&(postMessage({action:"generating"}),i.generateAsync({type:"blob"}).then(function(e){s=e,postMessage({action:"done"})}));break;case"download":s&&postMessage({action:"download",content:s});break;case"remove":s=null,i.remove("images")}}}});