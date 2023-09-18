
import { runLevanaClaim } from "./automations/levana/levana-claim";
import { runLevanaCrank } from "./automations/levana/levana-crank";
import { Chain, initializeWallet, refreshPeakHeights } from "./wallet/wallet";

main()
    .then(() => { })
    .catch((e) => console.error("APP CRASH! " + e));

async function main() {
    await initializeWallet();

    setTimeout(refreshPeakHeights, 1000); //Self refreshing

    setInterval(runLevanaCrank, 10000);
    setInterval(runLevanaClaim, 14400000);

    await sleepInfinite();
}

export async function handleNewBlock(chain: Chain, height: number) {
    const start = new Date().getTime();
    await runLevanaCrank(chain);
    const elapsed = new Date().getTime() - start;
}

async function sleepInfinite() {
    await new Promise(() => { });
}
