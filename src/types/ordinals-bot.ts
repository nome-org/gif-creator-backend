export type OrdinalsBotErrorResponse =
    | {
          status: "error";
          error: string;
          reason: never;
      }
    | {
          status: "error";
          error: never;
          reason: string;
      };

export interface OrdinalsBotCreateOrderResponse {
    id: string;
    files: File[];
    lowPostage: boolean;
    charge: Charge;
    chainFee: number;
    serviceFee: number;
    fee: number;
    baseFee: number;
    rareSatsFee: number;
    postage: number;
    referral?: any;
    rareSats: string;
    receiveAddress: string;
    webhookUrl: string;
    status: "ok";
    orderType: string;
    state: string;
    createdAt: CreatedAt;
}

interface CreatedAt {
    ".sv": string;
}

interface Charge {
    id: string;
    description: string;
    desc_hash: boolean;
    created_at: number;
    status: string;
    amount: number;
    callback_url?: any;
    success_url?: any;
    hosted_checkout_url: string;
    order_id?: any;
    currency: string;
    source_fiat_value: number;
    fiat_value: number;
    auto_settle: boolean;
    notif_email?: any;
    address: string;
    chain_invoice: Chaininvoice;
    uri: string;
    ttl: number;
    lightning_invoice: Lightninginvoice;
}

interface Lightninginvoice {
    expires_at: number;
    payreq: string;
}

interface Chaininvoice {
    address: string;
}

interface File {
    size: number;
    type: string;
    name: string;
    url: string;
    s3Key: string;
}

export interface OrdinalsBotWebhookPayload {
    id: string;
    index: number;
    file: File & {
        iqueued: boolean;
        iqueuedAt: number;
    };
    tx: Tx;
}

interface Tx {
    satpoint: string;
    commit: string;
    fees: number;
    reveal: string;
    inscription: string;
    updatedAt: string;
}
