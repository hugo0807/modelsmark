/**
 * 3:1 混合价公式条。
 *
 * 混合价是本站的默认排序口径，但它是一个「人为约定」的数字：
 * 不解释清楚 3:1 是怎么来的，用户就无法判断这个口径是否适合自己的业务，
 * 也无法用它去和别处的报价对齐。所以公式条必须和数字同时出现，
 * 而不是塞进页脚小字里。
 */

import Glossary from '../common/Glossary';

export default function FormulaBar({
  exampleIn,
  exampleOut,
  exampleBlend,
}: {
  /** 示例的输入价 / 输出价 / 混合价（¥ / 百万 tokens） */
  exampleIn: number | null;
  exampleOut: number | null;
  exampleBlend: number | null;
}) {
  const has = exampleIn != null && exampleOut != null && exampleBlend != null;
  return (
    <div className="formula">
      <b>3:1 混合价</b> ＝（3 × 输入价 ＋ 1 × 输出价）÷ 4
      {has && (
        <span className="formula-eg">
          示例：输入 ¥{(exampleIn as number).toFixed(2)}、输出 ¥{(exampleOut as number).toFixed(2)} →（
          {`3 × ${(exampleIn as number).toFixed(2)} ＋ ${(exampleOut as number).toFixed(2)}`}
          ）÷ 4 ＝ <b>¥{(exampleBlend as number).toFixed(2)}</b> / 百万 tokens
        </span>
      )}
      <span className="formula-why">
        按 3 份输入配 1 份输出的典型对话用量加权，把三项价格压成一个可比数字。缓存读不计入混合价。
      </span>
      <Glossary term="blended" label="口径说明" />
    </div>
  );
}
