import { ChannelAdapter, ChannelTypeDescriptor } from "./types.js";

export class AdapterRegistry {
  private adapters = new Map<string, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  get(type: string): ChannelAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) throw new Error(`Unknown channel type: ${type}`);
    return adapter;
  }

  has(type: string): boolean {
    return this.adapters.has(type);
  }

  all(): ChannelAdapter[] {
    return [...this.adapters.values()];
  }

  describeAll(): ChannelTypeDescriptor[] {
    return this.all().map((a) => ({
      type: a.type,
      displayName: a.displayName,
      description: a.description,
      configSchema: a.describeConfig(),
    }));
  }
}
