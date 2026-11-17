/*
 * 캐릭터 그리기 모듈 (게임 로직과 분리)
 * ------------------------------------------------------------
 * ※ 지금 캐릭터는 "임시 캐릭터"입니다. 이미지 패키지에 캐릭터 그림이 없어 캔버스 도형으로 그립니다.
 *
 * 나중에 PNG 걷기 스프라이트로 바꾸려면 아래 MP_CHARACTER 설정만 바꾸면 됩니다:
 *   window.MP_CHARACTER = {
 *     type: 'sprite',
 *     src: 'assets/characters/player-walk.png',
 *     frameWidth: 64, frameHeight: 64,      // 한 칸 크기
 *     frames: 4,                            // 한 줄(방향)당 걷기 프레임 수
 *     rows: { down: 0, left: 1, right: 2, up: 3 },  // 방향별 줄 번호
 *     fps: 8,
 *     drawHeight: 56,                        // 지도 좌표 기준 그릴 높이(px)
 *     anchor: [0.5, 1]                       // 발 위치 기준점(가운데 아래)
 *   };
 * 정지 PNG 한 장이면 frames: 1, rows 를 모두 0 으로 두면 됩니다.
 * 게임 로직은 draw(ctx, x, y, dir, moving, time) 만 부릅니다. (x,y) = 발 위치(지도 좌표)
 */
window.MP_CHARACTER = window.MP_CHARACTER || { type: 'placeholder' };

(function () {
  function PlaceholderCharacter() { this.ready = true; this.isPlaceholder = true; }
  PlaceholderCharacter.prototype.draw = function (ctx, x, y, dir, moving, t) {
    var bob = moving ? Math.abs(Math.sin(t * 12)) * 3 : 0;
    var step = moving ? Math.sin(t * 12) * 3 : 0;
    ctx.save();
    ctx.translate(x, y);
    // 그림자
    ctx.fillStyle = 'rgba(30,40,60,0.28)';
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    // 다리
    ctx.fillStyle = '#3d4a7a';
    ctx.fillRect(-7 + step * 0.5, -12, 5, 12);
    ctx.fillRect(2 - step * 0.5, -12, 5, 12);
    ctx.translate(0, -bob);
    // 몸통
    ctx.fillStyle = '#ff6b6b';
    roundRect(ctx, -11, -32, 22, 22, 7); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    // 머리
    ctx.fillStyle = '#ffd9b8';
    ctx.beginPath(); ctx.arc(0, -43, 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.stroke();
    // 모자
    ctx.fillStyle = '#ffcf3f';
    ctx.beginPath(); ctx.arc(0, -46, 12.5, Math.PI, 0); ctx.fill();
    // 눈 (바라보는 방향)
    if (dir !== 'up') {
      var ex = dir === 'left' ? -4 : dir === 'right' ? 4 : 0;
      ctx.fillStyle = '#2b2b3a';
      ctx.beginPath(); ctx.arc(ex - 4, -42, 1.8, 0, Math.PI * 2); ctx.arc(ex + 4, -42, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  function SpriteCharacter(cfg) {
    var self = this;
    this.cfg = cfg; this.ready = false; this.isPlaceholder = false;
    this.img = new Image();
    this.img.onload = function () { self.ready = true; };
    this.img.src = cfg.src;
  }
  SpriteCharacter.prototype.draw = function (ctx, x, y, dir, moving, t) {
    var c = this.cfg;
    var row = (c.rows && c.rows[dir] != null) ? c.rows[dir] : 0;
    var frame = moving && c.frames > 1 ? Math.floor(t * (c.fps || 8)) % c.frames : 0;
    var h = c.drawHeight || c.frameHeight, w = h * c.frameWidth / c.frameHeight;
    var a = c.anchor || [0.5, 1];
    ctx.drawImage(this.img, frame * c.frameWidth, row * c.frameHeight, c.frameWidth, c.frameHeight,
      x - w * a[0], y - h * a[1], w, h);
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  window.createCharacter = function (cfg) {
    var fallback = new PlaceholderCharacter();
    if (!cfg || cfg.type !== 'sprite') return fallback;
    var sprite = new SpriteCharacter(cfg);
    // 스프라이트 이미지가 준비되기 전(또는 실패 시)에는 임시 캐릭터로 그림
    return { get isPlaceholder() { return !sprite.ready; },
      draw: function () { (sprite.ready ? sprite : fallback).draw.apply(sprite.ready ? sprite : fallback, arguments); } };
  };
})();
