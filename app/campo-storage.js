/* IgnisPyro Fogo Técnico — armazenamento offline de anexos.
   IndexedDB conserva ficheiros binários; não publicar dados reais no GitHub. */
'use strict';
(function(root){
 const DB='ignispyro-fogo-campo', VERSION=1;
 function open(){
   return new Promise((resolve,reject)=>{
     const request=indexedDB.open(DB,VERSION);
     request.onupgradeneeded=()=>{
       const db=request.result;
       if(!db.objectStoreNames.contains('anexos')){
         const store=db.createObjectStore('anexos',{keyPath:'id'});
         store.createIndex('acaoId','acaoId',{unique:false});
       }
     };
     request.onsuccess=()=>resolve(request.result);
     request.onerror=()=>reject(request.error);
   });
 }
 async function transaction(mode,action){
   const db=await open();
   return new Promise((resolve,reject)=>{
     const tx=db.transaction('anexos',mode), store=tx.objectStore('anexos');
     let result;
     try{result=action(store);}catch(err){db.close();reject(err);return;}
     tx.oncomplete=()=>{db.close();resolve(result?.result);};
     tx.onerror=()=>{db.close();reject(tx.error);};
     tx.onabort=()=>{db.close();reject(tx.error);};
   });
 }
 async function guardarAnexo({acaoId,parcelaId='',ficheiro,tipo='fotografia',descricao='',capturadoEm,latitude=null,longitude=null}){
   if(!acaoId||!(ficheiro instanceof Blob))throw Error('Ação e ficheiro são obrigatórios');
   const id=crypto.randomUUID(), agora=new Date().toISOString();
   const item={id,acaoId,parcelaId,tipo,descricao,capturadoEm:capturadoEm||new Date(ficheiro.lastModified||Date.now()).toISOString(),registadoEm:agora,
     latitude,longitude,nome:ficheiro.name||id,mime:ficheiro.type||'application/octet-stream',ficheiro};
   await transaction('readwrite',store=>store.put(item));
   return {id,acaoId,parcelaId,tipo,registadoEm:agora};
 }
 async function listarAnexos(acaoId){
   const db=await open();
   return new Promise((resolve,reject)=>{
     const tx=db.transaction('anexos','readonly');
     const request=tx.objectStore('anexos').index('acaoId').getAll(acaoId);
     request.onsuccess=()=>resolve(request.result);
     request.onerror=()=>reject(request.error);
     tx.oncomplete=()=>db.close();
   });
 }
 function importarAnexos(items) {
   return transaction('readwrite', store => {
     for (const item of items) store.add(item);
   });
 }
 async function atualizarAnexo(item){return transaction('readwrite',store=>store.put(item));}
 async function apagarAnexo(id){return transaction('readwrite',store=>store.delete(id));}
 root.IgnisPyroCampoStorage={guardarAnexo,listarAnexos,atualizarAnexo,importarAnexos,apagarAnexo};
})(typeof window!=='undefined'?window:globalThis);
