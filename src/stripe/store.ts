import { promises as fs } from "fs"
import path from "path"

export interface StripeStoreData {
  accountId?: string
  accountLinkUrl?: string
  checkoutSessionId?: string
  checkoutSessionUrl?: string
  productId?: string
  defaultPriceId?: string
  setupIntentId?: string
  defaultPaymentMethodId?: string
  subscriptionId?: string
}

export class StripeStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<StripeStoreData> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8")
      return JSON.parse(raw) as StripeStoreData
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {}
      }
      throw error
    }
  }

  async update(patch: Partial<StripeStoreData>): Promise<StripeStoreData> {
    const current = await this.read()
    const next = { ...current, ...patch }
    await fs.mkdir(path.dirname(path.resolve(this.filePath)), {
      recursive: true,
    })
    await fs.writeFile(this.filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8")
    return next
  }

  async require<K extends keyof StripeStoreData>(
    key: K,
    label: string,
  ): Promise<NonNullable<StripeStoreData[K]>> {
    const data = await this.read()
    const value = data[key]
    if (!value) {
      throw new Error(
        `${label} is not set in ${this.filePath}. Run the prerequisite step first.`,
      )
    }
    return value as NonNullable<StripeStoreData[K]>
  }
}
