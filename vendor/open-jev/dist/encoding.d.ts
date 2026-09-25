/**
 * Sequence builders for the two model families.
 *
 * open-jev (DeBERTa):
 *   [CLS] [STATE] state [Q] instructions [OPT] option_1 [OPT] option_2 … [Q] … [SEP]
 *   plus the span-slot tensor (`seg`) and per-pair slot ids (`pair_q`, `pair_opt`).
 *
 * kev (Qwen3):
 *   <state> state <q> instructions <opt> option_1 </opt> <opt> option_2 </opt> … <decide> <q> …
 *   only `input_ids` and `attention_mask`; the graph derives the block-causal
 *   mask from the delimiters and returns one logit per token.
 */
export type MarkerIds = {
    cls: number;
    sep: number;
    state: number;
    q: number;
    opt: number;
};
export type TokenizedQuestion = {
    instructions: number[];
    options: number[][];
};
export type EncodedSequence = {
    inputIds: number[];
    /** Extra int64 inputs besides `input_ids` and `attention_mask`. */
    extraInputs: Record<string, number[]>;
    /** Per question: indices into the flat `logits` output, one per option. */
    groups: number[][];
    /** Number of state tokens that made it into the sequence. */
    stateTokens: number;
    /** Whether the state had to be cut. */
    stateTruncated: boolean;
};
export type EncodeParams = {
    state: number[];
    questions: TokenizedQuestion[];
    markers: MarkerIds;
    maxStateTokens: number;
    maxLength: number;
};
export declare function encodeSequence(params: EncodeParams): EncodedSequence;
export type KevDelimiterIds = {
    state: number;
    question: number;
    optionStart: number;
    optionEnd: number;
    decide: number;
};
export type KevEncodeParams = {
    state: number[];
    questions: TokenizedQuestion[];
    delimiters: KevDelimiterIds;
    maxStateTokens: number;
    /** Limit for the state plus one question branch. */
    maxLength: number;
};
export declare function encodeKevSequence(params: KevEncodeParams): EncodedSequence;
/**
 * gliner2 (GLiNER2.5-Decide, DeBERTa-v3-large):
 *   ( [P] prompt ( [L] option_1 [L] option_2 … ) ) [SEP_STRUCT] ( [P] … ) [SEP_TEXT] word word …
 *   plus `marker_positions`, the index of every [L] token; the graph returns
 *   one logit per marker. `prompt` is the instructions with option descriptions
 *   appended as ` [DESCRIPTION] option: description`; the state is lowercased
 *   and tokenized word by word (see `gliner2Family`).
 */
export type Gliner2MarkerIds = {
    p: number;
    l: number;
    sepStruct: number;
    sepText: number;
    /** Token ids of "(" and ")" as standalone words. */
    open: number[];
    close: number[];
};
export type Gliner2EncodeParams = {
    state: number[];
    questions: TokenizedQuestion[];
    markers: Gliner2MarkerIds;
    maxStateTokens: number;
    maxLength: number;
};
export declare function encodeGliner2Sequence(params: Gliner2EncodeParams): EncodedSequence;
//# sourceMappingURL=encoding.d.ts.map