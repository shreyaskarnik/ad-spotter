import type { AnswersFor, DecideOptions, OpenJevInfo, OpenJevOptions, OpenJevRuntime, Questions } from "./types";
export { MODELS } from "./models";
export { choice, noul, score } from "./questions";
export type { Answer, AnswerFor, AnswersFor, ChoiceAnswer, ChoiceQuestion, DecideOptions, LoadProgress, ModelAlias, ModelFamily, ModelId, NoulAnswer, NoulQuestion, OpenJevDevice, OpenJevDtype, OpenJevInfo, OpenJevOptions, OpenJevRuntime, Question, Questions, ScoreAnswer, ScoreQuestion, } from "./types";
/**
 * Typed decisions in the browser with Jev-shaped models.
 *
 * One `state` (any text) plus any number of typed questions go in, one
 * forward pass returns a calibrated probability distribution per question.
 * Nothing is generated, so answers are always one of the options you gave.
 *
 * Create an instance with `OpenJev.load()`. Built-in models: `kev-0.6b`
 * (default) and `kev-4b` (Qwen3), `open-jev` (DeBERTa-v3-large) and
 * `gliner2-decide` (GLiNER2.5-Decide, DeBERTa-v3-large).
 */
export declare class OpenJev {
    /** The model, family, backend and weight variant that were loaded. */
    readonly runtime: OpenJevRuntime;
    private readonly model;
    private readonly tokenizer;
    private readonly family;
    private readonly defaults;
    private readonly maxLength;
    private queue;
    private disposed;
    private constructor();
    /**
     * Download (or read from cache) the tokenizer and model and return a ready
     * instance.
     *
     * Supported options:
     * - `model`: `kev-0.6b` (default), `kev-4b`, `open-jev`, `gliner2-decide` or a Hugging Face repo id.
     * - `dtype`: `fp32 | fp16 | q4 | q4f16 | auto` (default `auto`).
     * - `device`: `webgpu | wasm | cpu | auto` (default `auto`).
     * - `onProgress`: download progress callback.
     * - `temperature`, `maxStateTokens`, `truncation`: defaults for `decide()`.
     * - `maxLength`: context limit (model-specific default).
     */
    static load(options?: OpenJevOptions): Promise<OpenJev>;
    /**
     * Get model metadata for a configuration without loading it.
     *
     * - `isCached`: whether every required file is present in the browser cache.
     * - `downloadSize`: total size in bytes of the files that will be fetched.
     * - `files`: the file list; `model`, `family`, `device`, `dtype`: the resolved runtime.
     */
    static info(options?: Pick<OpenJevOptions, "model" | "device" | "dtype">): Promise<OpenJevInfo>;
    /**
     * Answer typed questions about one state in a single forward pass.
     *
     * Pass questions as an array (answers come back as a tuple in the same
     * order) or as an object (answers come back under the same keys).
     */
    decide<const Qs extends Questions>(state: string, questions: Qs, options?: DecideOptions): Promise<AnswersFor<Qs>>;
    /**
     * Number of tokens `text` occupies in the sequence (without markers).
     * Useful to check a state against `maxStateTokens` before deciding.
     */
    countTokens(text: string): number;
    /**
     * Release the ONNX session. Pending `decide()` calls finish first; the
     * instance cannot be used afterwards.
     */
    dispose(): Promise<void>;
    private run;
    /** Tokenize caller text (escaped per family, no special tokens). */
    private encode;
    private enqueue;
    private assertNotDisposed;
}
//# sourceMappingURL=index.d.ts.map