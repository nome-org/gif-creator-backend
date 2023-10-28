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
    referral?: string;
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
    callback_url?: string;
    success_url?: string;
    hosted_checkout_url: string;
    order_id?: string;
    currency: string;
    source_fiat_value: number;
    fiat_value: number;
    auto_settle: boolean;
    notif_email?: string;
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
    file: WebhookFile;
    tx: Tx;
}

interface WebhookFile extends File {
    iqueued: boolean;
    iqueuedAt: number;
}
interface Tx {
    commit: string;
    fees: number;
    inscription: string;
    reveal: string;
    satpoint: string;
    updatedAt: string;
}
