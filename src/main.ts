
import { runLevanaClaim } from "./automations/levana/levana-claim";
import { runLevanaCrank } from "./automations/levana/levana-crank";
import { initializeWallet } from "./wallet/wallet";

main()
    .then(() => { })
    .catch((e) => console.error("APP CRASH! " + e));

async function main() {
    await initializeWallet();

    setInterval(runLevanaCrank, 20000);
    setInterval(runLevanaClaim, 14400000);

    await sleepInfinite();
}

async function sleepInfinite() {
    await new Promise(() => { });
}
