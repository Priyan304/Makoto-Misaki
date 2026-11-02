import { useEffect, useRef, useState } from 'react';
import { ChevronDown, RotateCcw, Smile } from 'lucide-react';
import type { Application } from 'pixi.js';
import type { Live2DModel, Cubism4InternalModel } from 'pixi-live2d-display/cubism4';
import type { CompanionState } from '../companion/controller';
import FallbackAvatar from './FallbackAvatar';
import { loadCubismCore } from './runtime';
import { expressionChoices, loadExpressions, type ExpressionId } from './expressions';

export default function Avatar({ state, reducedMotion, scale = 1 }: { state: CompanionState; reducedMotion: boolean; scale?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const options = useRef({ state, reducedMotion, scale });
  const refresh = useRef<() => void>(() => {});
  const selected = useRef<ExpressionId[]>([]);
  const [activeExpressions, setActiveExpressions] = useState<ExpressionId[]>([]);
  const [expressionsOpen, setExpressionsOpen] = useState(false);
  const [expressionError, setExpressionError] = useState('');
  const [expressionsReady, setExpressionsReady] = useState(false);
  selected.current = activeExpressions;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  options.current = { state, reducedMotion, scale };

  useEffect(() => { refresh.current(); }, [state, reducedMotion, scale]);
  useEffect(() => { refresh.current(); }, [activeExpressions]);
  useEffect(() => {
    const container = host.current!;
    let disposed = false;
    let app: Application | undefined;
    let model: Live2DModel | undefined;
    let observer: ResizeObserver | undefined;
    let elapsed = 0;
    let still = false;
    let contextLost = false;
    let onResize = () => {};
    const controller = new AbortController();
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pixelRatio = () => Math.max(1, window.devicePixelRatio || 1);
    let densityMedia: MediaQueryList | undefined;
    const isStill = () => options.current.reducedMotion || media.matches;
    const render = () => {
      if (!app || !model) return;
      // The adapter skips updates when its delta is zero. Apply one explicit
      // zero-time update so expression/settings changes also work while still.
      model.internalModel.update(0, elapsed);
      model.update(0);
      app.render();
    };
    const sync = () => {
      if (disposed || contextLost || !app || !model) return;
      still = isStill();
      onResize();
      if (document.hidden || still) app.stop(); else app.start();
      if (!document.hidden) render();
    };
    const watchDensity = () => {
      densityMedia?.removeEventListener('change', densityChanged);
      densityMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      densityMedia.addEventListener('change', densityChanged);
    };
    const densityChanged = () => {
      // Re-arm for the new density, including monitor changes that leave the
      // element's CSS dimensions unchanged (and do not wake ResizeObserver).
      watchDensity();
      sync();
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      app?.stop();
      if (!disposed) setStatus('error');
    };
    document.addEventListener('visibilitychange', sync);
    media.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    watchDensity();
    // A density-only change may arrive without either browser event. This
    // check also works with the animation ticker stopped for reduced motion;
    // it does not resize or redraw unless the backing resolution is stale.
    const densityTimer = window.setInterval(() => {
      if (!document.hidden && !contextLost && app && model && app.renderer.resolution !== pixelRatio()) densityChanged();
    }, 1000);
    refresh.current = sync;

    void (async () => {
      await loadCubismCore();
      const PIXI = await import('pixi.js');
      // Avoid eval-generated shaders under the desktop CSP.
      const { install } = await import('@pixi/unsafe-eval');
      install(PIXI);
      const { Live2DModel } = await import('pixi-live2d-display/cubism4');
      if (disposed) return;
      app = new PIXI.Application({ backgroundAlpha: 0, antialias: true, autoStart: false, sharedTicker: false, resolution: pixelRatio(), autoDensity: true });
      app.ticker.maxFPS = 30;
      app.view.addEventListener('webglcontextlost', onContextLost);
      container.appendChild(app.view);
      model = await Live2DModel.from(`${import.meta.env.BASE_URL}models/changli/长离.model3.json`, { autoUpdate: false, autoInteract: false });
      if (disposed) { model.destroy({ texture: true, baseTexture: true }); return; }
      const internal = model.internalModel as Cubism4InternalModel;
      const core = internal.coreModel;
      if (internal.physics) {
        const evaluatePhysics = internal.physics.evaluate.bind(internal.physics);
        internal.physics.evaluate = (core, dt) => { if (!isStill()) evaluatePhysics(core, dt); };
      }
      // Compose the supplied files after physics; loadParameters restores the
      // neutral baseline each frame, preventing additive values accumulating.
      void loadExpressions(controller.signal).then(expressions => {
        if (disposed) return;
        internal.on('beforeModelUpdate', () => {
          for (const choice of expressionChoices) {
            if (!selected.current.includes(choice.id)) continue;
            for (const parameter of expressions.get(choice.id)!.Parameters) {
              const current = core.getParameterValueById(parameter.Id);
              const value = parameter.Blend === 'Overwrite' ? parameter.Value
                : parameter.Blend === 'Multiply' ? current * parameter.Value : current + parameter.Value;
              core.setParameterValueById(parameter.Id, value);
            }
          }
        });
        setExpressionsReady(true);
      }).catch(error => {
        if (!disposed && !controller.signal.aborted) setExpressionError(error instanceof Error ? error.message : 'Expressions could not be loaded.');
      });
      // The supplied EyeBlink group is empty; use the model's actual rig IDs.
      internal.on('beforeMotionUpdate', () => {
        const active = options.current.state;
        const t = still ? 0 : elapsed / 1000;
        const blinkPhase = t % 4.8;
        const eyeOpen = !still && blinkPhase > 4.55 ? Math.min(1, Math.abs(blinkPhase - 4.675) / .1) : 1;
        core.setParameterValueById('ParamEyeLOpen', eyeOpen);
        core.setParameterValueById('ParamEyeROpen', eyeOpen);
        core.setParameterValueById('ParamAngleX', still ? 0 : Math.sin(t * .65) * 3);
        core.setParameterValueById('ParamAngleY', active === 'thinking' ? -5 : active === 'listening' ? 3 : 0);
        core.setParameterValueById('ParamAngleZ', active === 'thinking' ? 5 : still ? 0 : Math.sin(t * .48) * 1.5);
        core.setParameterValueById('ParamBodyAngleX', still ? 0 : Math.sin(t * .4));
        core.setParameterValueById('ParamBrowLY', active === 'error' ? -.25 : 0);
        core.setParameterValueById('ParamBrowRY', active === 'error' ? -.25 : 0);
        core.setParameterValueById('ParamMouthOpenY', 0);
      });
      const updateBreath = internal.breath.updateParameters.bind(internal.breath);
      internal.breath.updateParameters = (core, dt) => { if (!isStill()) updateBreath(core, dt); };
      app.stage.addChild(model);
      model.anchor.set(.5, 0);
      const width = internal.originalWidth;
      const height = internal.originalHeight;
      const chatPanel = container.closest('.companion-grid')?.querySelector<HTMLElement>('.chat-card');
      onResize = () => {
        if (!app || !model) return;
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        // Update the backing buffer before resizing. A ratio captured only at
        // mount leaves a low-resolution image stretched after zooming back in.
        app.renderer.resolution = pixelRatio();
        app.renderer.resize(w, h);
        const bounds = container.getBoundingClientRect();
        const panel = chatPanel?.getBoundingClientRect();
        const sidePanel = panel && panel.left >= bounds.left + w / 2;
        let zoom: number;
        if (sidePanel) {
          // Match the reference's large portrait. A separate right-hand chat
          // panel must not resize the character when its conversation grows.
          zoom = Math.min(w / (width * .7), h / (height * .64)) * options.current.scale;
        } else {
          // On narrow/compact screens keep the existing bottom dialogue layout.
          const clearHeight = Math.max(1, Math.min(h, (panel?.top ?? bounds.bottom) - bounds.top - 12));
          const kneeHeight = clearHeight + Math.min(28, clearHeight * .05);
          const requestedZoom = Math.min(w / (width * .7), kneeHeight / (height * .72)) * options.current.scale * 1.4;
          zoom = Math.min(requestedZoom, clearHeight / (height * .48));
        }
        model.scale.set(zoom);
        model.position.set(w / 2, 0);
      };
      app.ticker.add(() => {
        if (!model || !app) return;
        const dt = Math.min(app.ticker.deltaMS, 50);
        elapsed += dt;
        model.update(dt);
      });
      observer = new ResizeObserver(sync);
      observer.observe(container);
      if (chatPanel) observer.observe(chatPanel);
      sync();
      setStatus('ready');
    })().catch(error => {
      if (disposed) return;
      console.warn('Live2D avatar unavailable:', error);
      app?.view.removeEventListener('webglcontextlost', onContextLost);
      app?.destroy(true, { children: true, texture: true, baseTexture: true });
      app = undefined;
      if (model && !model.destroyed) model.destroy({ texture: true, baseTexture: true });
      model = undefined;
      setStatus('error');
    });

    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(densityTimer);
      refresh.current = () => {};
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      media.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
      densityMedia?.removeEventListener('change', densityChanged);
      app?.view.removeEventListener('webglcontextlost', onContextLost);
      app?.destroy(true, { children: true, texture: true, baseTexture: true });
    };
  }, []);

  function toggleExpression(id: ExpressionId) {
    setActiveExpressions(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
  }

  return <>
    <div ref={host} className="live2d-avatar" role="img" aria-label={`Misaki, Changli Live2D avatar, ${state}`} data-status={status} hidden={status === 'error'} />
    {status === 'loading' && <span className="avatar-loading" role="status">Loading your avatar…</span>}
    {status === 'error' && <><FallbackAvatar state={state} reducedMotion={reducedMotion} scale={scale}/><span className="avatar-loading" role="status">Avatar unavailable · showing fallback</span></>}
    {status === 'ready' && <div className="expression-controls">
      {expressionsOpen && <div className="expression-panel" role="group" aria-label="Avatar expressions">
        <div className="expression-heading"><span>Make a little face</span><button type="button" onClick={() => setActiveExpressions([])} disabled={!activeExpressions.length} aria-label="Reset expressions"><RotateCcw size={12}/>Reset</button></div>
        <div className="expression-grid">{expressionChoices.map(choice => <button type="button" key={choice.id} aria-pressed={activeExpressions.includes(choice.id)} disabled={!expressionsReady} onClick={() => toggleExpression(choice.id)}>{choice.label}<span>{activeExpressions.includes(choice.id) ? '✓' : '+'}</span></button>)}</div>
        {expressionError && <p role="status">{expressionError}</p>}
      </div>}
      <button type="button" className="expression-trigger" aria-label="Avatar expressions" aria-expanded={expressionsOpen} onClick={() => setExpressionsOpen(value => !value)}><Smile size={15}/><span>{activeExpressions.length ? `${activeExpressions.length} expression${activeExpressions.length === 1 ? '' : 's'}` : 'Expressions'}</span><ChevronDown size={13}/></button>
    </div>}
  </>;
}
