/**
 * 数据可信度条。
 *
 * 放在首屏最上方而不是页脚：用户第一眼要判断的不是「谁最便宜」，
 * 而是「这份数据是否可信」——收录了多少模型多少渠道、什么时候抓的、
 * 多久更新一次。这三个数字决定了后面的结论值不值得看。
 *
 * 渠道数必须只算「真正采到报价」的渠道：
 * 渠道表里还有已收录、但本期没抓到价的渠道，把它们算进来会虚报覆盖度。
 */

import { fmtInt } from '../../lib/format';

export default function TrustBar({
  models,
  channels,
  prices,
  updatedAt,
}: {
  models: number;
  channels: number;
  prices: number;
  updatedAt: string;
}) {
  return (
    <div className="trustbar">
      <span>
        <b>{fmtInt(models)}</b>个模型
      </span>
      <span>
        <b>{fmtInt(channels)}</b>家在售渠道
      </span>
      <span>
        <b>{fmtInt(prices)}</b>条官网报价
      </span>
      <span className="stamp">快照 {updatedAt} · 每周一 06:00 更新</span>
    </div>
  );
}
