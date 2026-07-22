import { promises as fs } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { getPaymentsStorePath } from "./config.js"
import type { PaymentsStoreData, PlatformCatalog, SellerRecord } from "./types.js"

const emptyStore = (): PaymentsStoreData => ({
  sellers: {},
  catalog: {},
})

async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

export class PaymentsStore {
  constructor(private readonly filePath: string = getPaymentsStorePath()) {}

  get path(): string {
    return this.filePath
  }

  async read(): Promise<PaymentsStoreData> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8")
      const parsed = JSON.parse(raw) as PaymentsStoreData
      return {
        sellers: parsed.sellers ?? {},
        catalog: parsed.catalog ?? {},
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === "ENOENT") return emptyStore()
      throw err
    }
  }

  async write(data: PaymentsStoreData): Promise<void> {
    await ensureParentDir(this.filePath)
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2) + "\n", "utf8")
  }

  async getSeller(sellerId: string): Promise<SellerRecord | null> {
    const data = await this.read()
    return data.sellers[sellerId] ?? null
  }

  async getSellerByStripeAccountId(
    stripeAccountId: string,
  ): Promise<SellerRecord | null> {
    const data = await this.read()
    return (
      Object.values(data.sellers).find(
        (s) => s.stripeAccountId === stripeAccountId,
      ) ?? null
    )
  }

  async listSellers(): Promise<SellerRecord[]> {
    const data = await this.read()
    return Object.values(data.sellers).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )
  }

  async upsertSeller(
    seller: Omit<SellerRecord, "createdAt" | "updatedAt"> &
      Partial<Pick<SellerRecord, "createdAt" | "updatedAt">>,
  ): Promise<SellerRecord> {
    const data = await this.read()
    const now = new Date().toISOString()
    const existing = data.sellers[seller.id]
    const record: SellerRecord = {
      ...existing,
      ...seller,
      createdAt: existing?.createdAt ?? seller.createdAt ?? now,
      updatedAt: now,
    }
    data.sellers[record.id] = record
    await this.write(data)
    return record
  }

  async updateSeller(
    sellerId: string,
    patch: Partial<Omit<SellerRecord, "id" | "createdAt">>,
  ): Promise<SellerRecord> {
    const existing = await this.getSeller(sellerId)
    if (!existing) {
      throw new Error(`Seller not found: ${sellerId}`)
    }
    return this.upsertSeller({ ...existing, ...patch, id: sellerId })
  }

  async getCatalog(): Promise<PlatformCatalog> {
    const data = await this.read()
    return data.catalog
  }

  async setCatalog(catalog: PlatformCatalog): Promise<PlatformCatalog> {
    const data = await this.read()
    data.catalog = {
      ...data.catalog,
      ...catalog,
      updatedAt: new Date().toISOString(),
    }
    await this.write(data)
    return data.catalog
  }
}

export function newSellerId(): string {
  return `seller_${randomUUID().replace(/-/g, "").slice(0, 16)}`
}

export const defaultStore = () => new PaymentsStore()
