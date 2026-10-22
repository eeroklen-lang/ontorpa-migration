import { padCatalogFlow } from "../botLinkers/powerAutomateDesktopLinker/PowerAutomateDesktopLinker";

// Prints one Power Automate Desktop flow with every action the exporter generates. Paste it into
// an empty subflow in the PAD designer: PAD should accept every action, flagging only the TODO
// values and UI elements. Names it rejects need fixing in padMapping.ts.
console.log(padCatalogFlow());
