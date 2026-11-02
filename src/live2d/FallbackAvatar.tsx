import { useEffect, useState } from 'react';
import type { CompanionState } from '../companion/controller';

/** Original code-drawn fallback. This is intentionally not a Cubism renderer. */
export default function Avatar({ state, reducedMotion, scale = 1 }: { state: CompanionState; reducedMotion: boolean; scale?: number }) {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return <div className={`avatar state-${state} ${reducedMotion ? 'still' : ''} ${visible ? '' : 'paused'}`} style={{ '--avatar-scale': scale } as React.CSSProperties}>
    <svg viewBox="0 0 400 480" role="img" aria-label={`Misaki, ${state === 'thinking' ? 'thinking' : 'a lilac-haired companion with a gentle smile'}`}>
      <defs>
        <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#c4b3df"/><stop offset=".55" stopColor="#aaa0ce"/><stop offset="1" stopColor="#807aa7"/></linearGradient>
        <linearGradient id="fringe" x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#e4d5f1"/><stop offset=".6" stopColor="#c4b4df"/><stop offset="1" stopColor="#a79ac6"/></linearGradient>
        <linearGradient id="skin" x1="0" y1="0" x2=".4" y2="1"><stop stopColor="#fff0e6"/><stop offset="1" stopColor="#f4ceca"/></linearGradient>
        <linearGradient id="coat" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fffdf6"/><stop offset="1" stopColor="#dfd7e9"/></linearGradient>
        <linearGradient id="iris" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#56516f"/><stop offset=".55" stopColor="#9884b9"/><stop offset="1" stopColor="#d0b7d8"/></linearGradient>
        <radialGradient id="blush"><stop stopColor="#ebacb8" stopOpacity=".65"/><stop offset="1" stopColor="#ebacb8" stopOpacity="0"/></radialGradient>
      </defs>
      <ellipse cx="200" cy="463" rx="99" ry="10" fill="#7e6d9c" opacity=".12"/>
      <g className="character-body">
        <path d="M107 198Q76 286 88 405Q105 439 142 429L264 430Q313 415 311 383Q327 297 292 190Z" fill="url(#hair)" stroke="#9285b0" strokeWidth="1.5"/>
        <path d="M111 277Q77 305 69 354L56 439Q72 454 102 451L121 381L119 466H283L279 376L300 451Q325 455 341 438L323 348Q318 306 280 283L233 270H166Z" fill="url(#coat)" stroke="#b9afc9" strokeWidth="1.5"/>
        <path d="M173 251L171 283L198 314L230 283L226 251" fill="url(#skin)" stroke="#dab5be" strokeWidth="1.4"/>
        <path d="M161 277L199 309L237 277L255 466H144Z" fill="#f6f2ed"/>
        <path d="M162 275L141 290L165 331L198 309ZM236 275L258 291L234 332L200 309Z" fill="#fffdf6" stroke="#d4cadb" strokeWidth="1.4"/>
        <path d="M199 312Q172 294 161 310L172 335L195 323L188 365L202 354L215 364L207 322L229 335L239 310Q222 294 201 312Z" fill="#9382b7" stroke="#7f6e9f" strokeWidth="1.3"/>
        <ellipse cx="200" cy="317" rx="8" ry="9" fill="#b6a3d4"/>
        <path d="M140 292L125 373L143 389L132 407L137 465M258 292L275 374L258 389L271 407L265 465" fill="none" stroke="#c9bed5" strokeWidth="2"/>
        <path d="M99 351L86 435M298 352L312 435M149 426Q197 434 251 425" fill="none" stroke="#c9bed5" strokeWidth="1.5"/>
        <circle cx="204" cy="385" r="3" fill="#b0a3c4"/><circle cx="204" cy="420" r="3" fill="#b0a3c4"/>
        <path d="M62 437L58 454Q62 470 74 472Q84 474 88 464L92 446M304 448L309 466Q316 477 327 469Q336 463 336 448" fill="url(#skin)" stroke="#dcb9c4" strokeWidth="1.5"/>
        <path d="M59 433L94 443L91 453L56 443ZM302 442L336 433L340 443L306 453Z" fill="#eee7f1" stroke="#c4b9d0"/>
      </g>
      <g className="character-head">
        <path d="M100 175Q80 90 133 56Q200 13 270 64Q311 98 295 192L285 279Q265 294 251 272L145 273Q123 301 103 276Z" fill="url(#hair)" stroke="#9385b1" strokeWidth="1.7"/>
        <path d="M122 152Q111 144 110 164Q109 184 128 188M276 152Q290 142 290 163Q291 183 274 189" fill="url(#skin)" stroke="#d3aebf" strokeWidth="1.4"/>
        <path d="M126 116Q144 78 200 83Q253 81 275 119L272 188Q268 224 238 245Q214 265 200 265Q181 262 156 240Q127 220 124 188Z" fill="url(#skin)" stroke="#d5afbf" strokeWidth="1.4"/>
        <path d="M136 163Q149 155 164 160M234 160Q250 154 263 163" fill="none" stroke="#9f82a5" strokeWidth="2" strokeLinecap="round"/>
        <g className="eyes">
          <path d="M137 180Q150 165 171 179L170 197Q153 209 141 195Z" fill="#fff8f6"/>
          <path d="M230 179Q249 164 263 180L258 197Q243 207 230 196Z" fill="#fff8f6"/>
          <ellipse cx="156" cy="187" rx="11" ry="15" fill="url(#iris)"/><ellipse cx="245" cy="187" rx="11" ry="15" fill="url(#iris)"/>
          <ellipse cx="157" cy="185" rx="4.3" ry="9" fill="#605471"/><ellipse cx="244" cy="185" rx="4.3" ry="9" fill="#605471"/>
          <ellipse cx="152" cy="180" rx="4" ry="4.8" fill="#fff"/><ellipse cx="241" cy="180" rx="4" ry="4.8" fill="#fff"/>
          <circle cx="160" cy="193" r="2" fill="#eee0ef"/><circle cx="248" cy="193" r="2" fill="#eee0ef"/>
          <path d="M134 176L139 180Q151 167 173 179M229 179Q248 165 263 180L268 175" fill="none" stroke="#63536f" strokeWidth="3.2" strokeLinecap="round"/>
          <path d="M141 199Q155 205 167 199M233 199Q246 204 258 199" fill="none" stroke="#b58fa8" strokeWidth="1.2"/>
        </g>
        <ellipse cx="144" cy="215" rx="22" ry="12" fill="url(#blush)"/><ellipse cx="255" cy="215" rx="22" ry="12" fill="url(#blush)"/>
        <path d="M199 201L196 214L201 216" fill="none" stroke="#d9b1ba" strokeWidth="1.3" strokeLinecap="round"/>
        <path className="smile" d="M190 233Q201 240 212 232" fill="none" stroke="#bc8396" strokeWidth="2" strokeLinecap="round"/>
        <path d="M114 159Q100 107 129 77Q154 42 202 49Q266 44 285 102Q295 137 275 168L262 127L253 155Q234 137 225 112L226 153Q207 143 194 113L179 156L166 140Q154 159 139 168L142 131L122 177Z" fill="url(#fringe)" stroke="#a799c4" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M125 170Q121 227 139 273L122 294Q102 249 109 185M273 165Q282 233 263 281L284 293Q304 234 289 165" fill="url(#fringe)" stroke="#a799c4" strokeWidth="1.5"/>
        <path d="M135 101Q151 66 185 66M216 65Q250 72 262 104M120 196Q119 237 129 261M284 197Q286 238 276 262" fill="none" stroke="#efe4f8" strokeWidth="3" opacity=".65" strokeLinecap="round"/>
        <path d="M104 128L124 117L140 130L121 139Z" fill="#7b6e9e"/><path d="M112 120L117 111L123 119L131 119L125 126L126 135L118 131L110 135L112 126L106 121Z" fill="#f7e5b5" stroke="#d9bf8b"/>
        <path d="M112 88Q139 38 199 40Q261 39 287 92Q254 69 200 70Q143 68 112 88Z" fill="#686078"/>
        <path d="M111 86Q106 61 133 43Q156 24 192 29Q230 20 265 48Q289 64 286 91Q249 65 200 67Q149 66 111 86Z" fill="#81758f" stroke="#6f627e" strokeWidth="1.5"/>
        <path d="M133 57Q186 23 239 46" fill="none" stroke="#a799b5" strokeWidth="2" opacity=".7"/>
        <path d="M258 76L271 59L279 78L270 88Z" fill="#d6c7e6"/>
      </g>
    </svg>
  </div>;
}
