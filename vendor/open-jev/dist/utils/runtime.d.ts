import type { OpenJevDevice, OpenJevDtype, OpenJevRuntime } from "../types";
export declare function isWebGpuAvailable(): boolean;
export declare function isWebGpuFp16Supported(): Promise<boolean>;
/**
 * Resolve `"auto"` device/dtype to concrete values.
 *
 * - device: `webgpu` when the runtime exposes WebGPU, `cpu` in Node.js,
 *   otherwise `wasm`.
 * - dtype: the family's preferred WebGPU variant when `shader-f16` is
 *   available, otherwise `q4`.
 */
export declare function resolveRuntime(options: {
    device?: OpenJevDevice | "auto";
    dtype?: OpenJevDtype | "auto";
}, webgpuDtype: OpenJevDtype): Promise<Pick<OpenJevRuntime, "device" | "dtype">>;
//# sourceMappingURL=runtime.d.ts.map