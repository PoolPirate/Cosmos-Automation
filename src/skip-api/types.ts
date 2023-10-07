import { ExecuteInstruction, JsonObject } from '@cosmjs/cosmwasm-stargate';
import { Coin } from '@cosmjs/stargate';

export interface SkipChainDefinition {
    chain_name: string;
    chain_id: string;
    pfm_enabled: boolean;
}

export interface SkipMessage {
    msg_type_url: string;
    msg: any;
}
