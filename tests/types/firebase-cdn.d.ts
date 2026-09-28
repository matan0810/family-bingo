// The app imports Firebase from the gstatic CDN by URL; for type checking, those URLs get the types of the
// same modules from the firebase npm package (a dev dependency of tests/).
declare module "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js" { export * from "firebase/app"; }
declare module "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js" { export * from "firebase/auth"; }
declare module "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js" { export * from "firebase/firestore"; }
