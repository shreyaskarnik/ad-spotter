import type { PretrainedConfig, PreTrainedTokenizer, Tensor } from "@huggingface/transformers";
import { type EncodedSequence, type TokenizedQuestion } from "./encoding";
import { type QuestionLimits } from "./questions";
import type { ModelAlias, ModelFamily, OpenJevDtype, Question } from "./types";
/** Hugging Face repos behind the built-in aliases. */
export declare const MODELS: Record<ModelAlias, string>;
export declare const DEFAULT_MODEL: ModelAlias;
export declare function resolveModelId(model: string | undefined): string;
export type JevModel = {
    (inputs: Record<string, Tensor>): Promise<{
        logits: Tensor;
    }>;
    dispose?: () => Promise<unknown>;
};
export type LoadModelOptions = {
    config: PretrainedConfig;
    dtype: OpenJevDtype;
    device: string;
    progress_callback: (info: unknown) => void;
};
export type FamilyDefaults = {
    temperature: number;
    maxStateTokens: number;
    maxLength: number;
};
/** Everything that differs between the model families. */
export type FamilyAdapter = {
    name: ModelFamily;
    /** Best variant on WebGPU with `shader-f16`; `q4` is used elsewhere. */
    webgpuDtype: OpenJevDtype;
    limits: QuestionLimits;
    defaults: FamilyDefaults;
    loadModel(modelId: string, options: LoadModelOptions): Promise<JevModel>;
    /** Resolve marker/delimiter token ids once the tokenizer is available. */
    prepare(tokenizer: PreTrainedTokenizer): void;
    /** Applied to every caller-provided text before tokenization. */
    escape(text: string): string;
    /**
     * Optional family-specific tokenization of the state and questions. When
     * absent, the state, each instruction and each option text (with `name:
     * description` for described choices) are tokenized as plain strings.
     */
    tokenize?(params: {
        state: string;
        questions: Question[];
        encode: (text: string) => number[];
    }): {
        state: number[];
        questions: TokenizedQuestion[];
    };
    encode(params: {
        state: number[];
        questions: TokenizedQuestion[];
        maxStateTokens: number;
        maxLength: number;
    }): EncodedSequence;
};
export declare function detectFamily(config: PretrainedConfig): FamilyAdapter;
//# sourceMappingURL=models.d.ts.map