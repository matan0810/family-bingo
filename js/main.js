// Entry point: wires the page's fixed elements, registers the service worker, signs in and renders.
import { startAuth } from "./data.js";
import { render, initWelcome, initAdmin } from "./views.js";
import { initDialogs } from "./dialogs.js";
import { initSettings } from "./settings.js";
import { initWording } from "./wording.js";
import { initNudge } from "./game.js";

initDialogs(); initSettings(); initWording(); initNudge(); initWelcome(); initAdmin();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(e => console.warn("sw", e));
render();
startAuth();
