import{createRequire} from"node:module";const require=createRequire(import.meta.url);
import{c}from"./chunk-QAYAQNCG.js";function $(t,i){let r=10,s=null,o=!1,l=!1,n=!1,u=[];for(let f=0;f<t.length;f++){let e=t[f];if(e==="-n"&&f+1<t.length){let a=t[++f];i==="tail"&&a.startsWith("+")?(n=!0,r=parseInt(a.slice(1),10)):r=parseInt(a,10)}else if(i==="tail"&&e.startsWith("-n+"))n=!0,r=parseInt(e.slice(3),10);else if(e.startsWith("-n"))r=parseInt(e.slice(2),10);else if(e==="-c"&&f+1<t.length)s=parseInt(t[++f],10);else if(e.startsWith("-c"))s=parseInt(e.slice(2),10);else if(e.startsWith("--bytes="))s=parseInt(e.slice(8),10);else if(e.startsWith("--lines="))r=parseInt(e.slice(8),10);else if(e==="-q"||e==="--quiet"||e==="--silent")o=!0;else if(e==="-v"||e==="--verbose")l=!0;else if(e.match(/^-\d+$/))r=parseInt(e.slice(1),10);else{if(e.startsWith("--"))return{ok:!1,error:c(i,e)};if(e.startsWith("-")&&e!=="-")return{ok:!1,error:c(i,e)};u.push(e)}}return s!==null&&(Number.isNaN(s)||s<0)?{ok:!1,error:{stdout:"",stderr:`${i}: invalid number of bytes
`,exitCode:1}}:Number.isNaN(r)||r<0?{ok:!1,error:{stdout:"",stderr:`${i}: invalid number of lines
`,exitCode:1}}:{ok:!0,options:{lines:r,bytes:s,quiet:o,verbose:l,files:u,fromLine:n}}}async function g(t,i,r,s){let{quiet:o,verbose:l,files:n}=i;if(n.length===0)return{stdout:s(t.stdin),stderr:"",exitCode:0};let u="",f="",e=0,a=l||!o&&n.length>1,h=0;for(let p=0;p<n.length;p++){let d=n[p];try{let b=t.fs.resolvePath(t.cwd,d),x=await t.fs.readFile(b);a&&(h>0&&(u+=`
`),u+=`==> ${d} <==
`),u+=s(x),h++}catch{f+=`${r}: ${d}: No such file or directory
`,e=1}}return{stdout:u,stderr:f,exitCode:e}}function k(t,i,r){if(r!==null)return t.slice(0,r);if(i===0)return"";let s=0,o=0,l=t.length;for(;s<l&&o<i;){let n=t.indexOf(`
`,s);if(n===-1)return`${t}
`;o++,s=n+1}return s>0?t.slice(0,s):""}function v(t,i,r,s){if(r!==null)return t.slice(-r);let o=t.length;if(o===0)return"";if(s){let f=0,e=1;for(;f<o&&e<i;){let h=t.indexOf(`
`,f);if(h===-1)break;e++,f=h+1}let a=t.slice(f);return a.endsWith(`
`)?a:`${a}
`}if(i===0)return"";let l=o-1;t[l]===`
`&&l--;let n=0;for(;l>=0&&n<i;){if(t[l]===`
`&&(n++,n===i)){l++;break}l--}l<0&&(l=0);let u=t.slice(l);return t[o-1]===`
`?u:`${u}
`}export{$ as a,g as b,k as c,v as d};
