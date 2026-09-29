import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');

test('all live-turn actions are guarded by the server-side active-player check', () => {
  const guardedEvents = [
    'roll', 'buy', 'skip-buy', 'pay', 'pay-jail', 'metro', 'card-action',
    'confirm-fire', 'asset-change', 'declare-bankruptcy', 'change-token',
    'end-turn', 'surrender'
  ];
  for (const event of guardedEvents) {
    const handler = source.match(new RegExp(`socket\\.on\\('${event}'.*?\\)\\);`, 's'))?.[0];
    assert.ok(handler, `server handler exists for ${event}`);
    assert.match(handler, /assertTurn\(r,socket\.id\)/, `${event} must be limited to the active player`);
  }
});

test('fire card dice are generated and summed on the server, then require active-player confirmation', () => {
  assert.match(source, /r\.fireResults=r\.players\.filter\(x=>!x\.bankrupt\)\.map\(x=>\(\{[\s\S]*?dice:\[roll\(\),roll\(\)\]/);
  assert.match(source, /r\.fireResults\.reduce\(\(sum,x\)=>sum\+x\.dice\[0\]\+x\.dice\[1\],0\)/);
  assert.match(source, /socket\.on\('confirm-fire'[\s\S]*?assertTurn\(r,socket\.id\)/);
});

test('asset and card rules match the approved game flow', () => {
  assert.match(source, /if\(p\.position!==i\)throw Error\('Chỉ được nâng cấp khi đang đứng trên chính ô đất đó\.'\)/);
  assert.match(source, /r\.pending=\{type:'highway-confirm'[\s\S]*?dest/);
  assert.match(source, /if\(t==='highway-confirm'\)[\s\S]*?resolve\(r,p\)/);
  assert.match(source, /swapOwners\(r,a,b,p,other\)/);
  assert.match(source, /payOrBankrupt\(r,other,p,100,'do Thằng Bờm'\)/);
  assert.match(source, /room\.pending=\{type:'bank',amount:-card\.cash,label:card\.t\};room\.phase='AWAIT_PAYMENT'/);
});

test('chance deck includes the approved movement and fee cards', () => {
  for (const title of [
    'Đất gần nhất', 'Đi đến Bưu Điện Hà Nội', 'Trả tiền điện', 'Về điểm xuất phát',
    'Miễn thuế nhà đất', 'Xổ số kiến thiết', 'Đến ga gần nhất', 'Hỏng đường ray',
    'Đi đến Tháp Rùa', 'Đi đến Landmark81'
  ]) assert.match(source, new RegExp(title));
  assert.match(source, /resolveNearestPropertyCard\(room,p,'land','Đất gần nhất'\)/);
  assert.match(source, /resolveNearestPropertyCard\(room,p,'rail','Ga gần nhất'\)/);
  assert.match(source, /recipientAmount/);
  assert.match(source, /if\(r\.pending\?\.force\)throw Error\('Thẻ này bắt buộc mua nếu ô chưa có chủ\.'\)/);
});
