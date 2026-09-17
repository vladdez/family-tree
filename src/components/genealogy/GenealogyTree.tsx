import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { relationStatusLabels, type TreePerson, type TreeRelationship } from '../../domain/relationships';
import type { TreeBranch } from '../../domain/tree-branches';
import type { HiddenRelativeGroup } from '../../domain/focused-tree';
import { layoutTree, type Geometry } from './layout';
import { fitView, fitNodes, scaleView, pinchView, type View } from './viewport';
import { edgePath, marriageMarkerPosition } from './edges';
import MarriageIcon from './MarriageIcon';
import { getFamilyConnections } from './families';
import FamilyConnections from './FamilyConnections';
import HiddenRelatives from './HiddenRelatives';
import './tree.css';

interface Props { people: TreePerson[]; relationships: TreeRelationship[]; branches?: TreeBranch[]; focusPersonId: string; familyPersonIds: string[]; relatives: Record<string, HiddenRelativeGroup[]> }
const emptyBranches: TreeBranch[] = [];

export default function GenealogyTree({ people, relationships, branches = emptyBranches, focusPersonId, familyPersonIds, relatives }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const relativesDialog = useRef<HTMLDialogElement>(null);
  const [fullscreenMode, setFullscreenMode] = useState<'native' | 'fallback' | null>(null);
  const [fullscreenPending, setFullscreenPending] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState('');
  const [relativePerson, setRelativePerson] = useState<TreePerson | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState('');
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const dragDistance = useRef(0);
  const graph = useMemo(() => geometry ? layoutTree(people, relationships, geometry, branches) : null, [people, relationships, geometry, branches]);
  const byId = useMemo(() => new Map(graph?.nodes.map((p) => [p.id, p]) ?? []), [graph]);
  const families = useMemo(() => graph && geometry ? getFamilyConnections(graph.nodes, relationships, geometry) : [], [graph, relationships, geometry]);
  const branchByPerson = useMemo(() => new Map(branches.flatMap((branch) => branch.personIds.map((id) => [id, branch] as const))), [branches]);

  useEffect(() => {
    const sync = () => {
      setFullscreenMode((current) => document.fullscreenElement === container.current ? 'native' : current === 'fallback' ? current : null);
      setFullscreenMessage('');
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    if (fullscreenMode !== 'fallback') return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const blocked: [HTMLElement, boolean][] = [];
    for (let element: HTMLElement | null = container.current; element && element !== document.body; element = element.parentElement) {
      for (const sibling of element.parentElement?.children ?? []) if (sibling !== element && sibling instanceof HTMLElement) {
        blocked.push([sibling, sibling.inert]); sibling.inert = true;
      }
    }
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || relativesDialog.current?.open) return;
      event.preventDefault(); setFullscreenMode(null);
      fullscreenButton.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = overflow;
      for (const [element, inert] of blocked) element.inert = inert;
      document.removeEventListener('keydown', escape);
    };
  }, [fullscreenMode]);

  async function toggleFullscreen() {
    const element = container.current;
    if (!element || fullscreenPending) return;
    setFullscreenMessage('');
    if (fullscreenMode === 'fallback') { setFullscreenMode(null); return; }
    setFullscreenPending(true);
    try {
      if (document.fullscreenElement === element) await document.exitFullscreen();
      else if (element.requestFullscreen) await element.requestFullscreen();
      else setFullscreenMode('fallback');
    } catch {
      if (document.fullscreenElement === element) setFullscreenMessage('Для выхода из полного экрана нажмите Esc.');
      else setFullscreenMode('fallback');
    } finally { setFullscreenPending(false); }
  }

  useEffect(() => {
    if (!viewport.current) return;
    const styles = getComputedStyle(viewport.current);
    const read = (name: string) => Number.parseFloat(styles.getPropertyValue(name));
    setGeometry({ nodeWidth: read('--tree-node-width'), nodeHeight: read('--tree-node-height'), gap: read('--tree-node-gap'), generationGap: read('--tree-generation-gap') });
  }, []);

  const fit = useCallback(() => {
    if (!viewport.current || !graph) return;
    const { width, height } = viewport.current.getBoundingClientRect();
    setView(fitView({ width, height }, graph));
  }, [graph]);

  const showFamily = useCallback(() => {
    if (!viewport.current || !graph || !geometry) return;
    const nodes = graph.nodes.filter((person) => familyPersonIds.includes(person.id));
    const { width, height } = viewport.current.getBoundingClientRect();
    setSelected(''); setView(nodes.length ? fitNodes({ width, height }, nodes, geometry) : fitView({ width, height }, graph));
  }, [graph, geometry, familyPersonIds]);

  useEffect(() => {
    if (!viewport.current || !graph) return;
    showFamily();
    let size = viewport.current.getBoundingClientRect();
    // Keep the current person and scale when fullscreen changes the available area.
    const observer = new ResizeObserver(() => {
      if (!viewport.current) return;
      const next = viewport.current.getBoundingClientRect();
      const dx = (next.width - size.width) / 2, dy = (next.height - size.height) / 2;
      if (dx || dy) setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
      size = next;
    }); observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [showFamily, graph]);

  useEffect(() => {
    if (relativePerson && !relativesDialog.current?.open) relativesDialog.current?.showModal();
  }, [relativePerson]);

  const zoom = useCallback((factor: number, point?: { x: number; y: number }) => {
    if (!viewport.current) return;
    const box = viewport.current.getBoundingClientRect();
    const anchor = point ?? { x: box.width / 2, y: box.height / 2 };
    setView((old) => scaleView(old, factor, anchor));
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      // Ordinary scrolling keeps the page usable; Ctrl/⌘ + wheel changes scale.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); const box = element.getBoundingClientRect();
      zoom(Math.exp(-event.deltaY * 0.003), { x: event.clientX - box.left, y: event.clientY - box.top });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [zoom]);

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (!pointers.current.size) { moved.current = false; dragDistance.current = 0; }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // Preserve a normal click on links; capture only once a drag actually starts.
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId); if (!previous) return;
    const before = [...pointers.current.values()];
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
    dragDistance.current += Math.hypot(dx, dy);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (dragDistance.current < 6) return;
    moved.current = true; setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (before.length === 2) {
      const after = [...pointers.current.values()], distance = (p: { x: number; y: number }[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const priorDistance = distance(before); if (priorDistance < 1) return;
      const box = event.currentTarget.getBoundingClientRect();
      const oldCenter = { x: (before[0].x + before[1].x) / 2 - box.left, y: (before[0].y + before[1].y) / 2 - box.top };
      const newCenter = { x: (after[0].x + after[1].x) / 2 - box.left, y: (after[0].y + after[1].y) / 2 - box.top };
      setView((old) => pinchView(old, distance(after) / priorDistance, oldCenter, newCenter));
    } else setView((old) => ({ ...old, x: old.x + dx, y: old.y + dy }));
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!pointers.current.size) setDragging(false);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const step = geometry?.gap ?? 0;
    const shifts: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (shifts[event.key]) { event.preventDefault(); const [dx, dy] = shifts[event.key]; setView((old) => ({ ...old, x: old.x + dx, y: old.y + dy })); }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.2); }
    if (event.key === '-') { event.preventDefault(); zoom(1 / 1.2); }
    if (event.key === '0') { event.preventDefault(); fit(); }
  }
  function focusPerson(id: string) {
    if (!id) { setSelected(''); fit(); return; }
    setSelected(id); const node = byId.get(id), box = viewport.current?.getBoundingClientRect();
    if (!node || !box || !geometry) return;
    const scale = Math.min(1.2, box.width / (geometry.nodeWidth + geometry.gap * 2));
    setView({ scale, x: box.width / 2 - (node.x + geometry.nodeWidth / 2) * scale, y: box.height / 2 - (node.y + geometry.nodeHeight / 2) * scale });
  }

  return <div ref={container} className={`genealogy-tree${fullscreenMode ? ' is-fullscreen' : ''}`}>
    <div className="tree-toolbar"><label className="field tree-search">Найти на древе<select value={selected} onChange={(event) => focusPerson(event.target.value)}><option value="">Главная линия</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.lifespan}</option>)}</select></label><div className="tree-controls"><button type="button" className="button" onClick={() => zoom(1.2)} aria-label="Увеличить">+</button><span className="tree-scale" aria-live="polite">{Math.round(view.scale * 100)}%</span><button type="button" className="button" onClick={() => zoom(1 / 1.2)} aria-label="Уменьшить">−</button><button type="button" className="button" onClick={showFamily}>Моя семья</button><button type="button" className="button" onClick={() => { setSelected(''); fit(); }}>Все предки</button><button ref={fullscreenButton} type="button" className="button tree-fullscreen-button" onClick={toggleFullscreen} aria-pressed={!!fullscreenMode} disabled={!graph || fullscreenPending} title={fullscreenMode ? 'Выйти из полного экрана (Esc)' : 'Развернуть древо на весь экран'}>{fullscreenMode ? 'Выйти из полного экрана' : 'Весь экран'}</button></div></div>
    {fullscreenMessage && <p className="tree-fullscreen-message" role="status">{fullscreenMessage}</p>}
    {branches.some((branch) => branch.kind === 'family') && <div className="tree-branch-legend" role="group" aria-label="Цвета семейных ветвей">{branches.filter((branch) => branch.kind === 'family').map((branch) => <span key={branch.id} data-branch={branch.id}>{branch.label}</span>)}</div>}
    <div ref={viewport} className={`tree-viewport${dragging ? ' is-dragging' : ''}${graph ? '' : ' is-register'}`} tabIndex={0} role="region" aria-label="Интерактивное семейное древо" aria-describedby="tree-instructions" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp} onPointerLeave={(event) => { if (!dragging) pointers.current.delete(event.pointerId); }} onKeyDown={keyboard} onClickCapture={(event) => { if (moved.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); } }}>
      {graph && geometry ? <div className="tree-canvas" style={{ width: graph.width, height: graph.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        {graph.lanes?.filter((lane) => branches.find((branch) => branch.id === lane.id)?.kind !== 'descendants').map((lane) => <div key={lane.id} className="tree-branch-heading" style={{ left: lane.x, top: lane.y, width: lane.width }}>{lane.label}</div>)}
        {graph.periods?.map((period) => <div key={period.y} className="tree-period" style={{ left: geometry.gap, top: period.y, width: geometry.nodeWidth }}><span>{period.label}</span><small>{period.dated ? 'Годы рождения' : 'Нет известных дат'}</small></div>)}
        <svg className="tree-edges" width={graph.width} height={graph.height} aria-hidden="true"><g className="tree-period-lines">{graph.periods?.map((period) => <line key={period.y} x1={geometry.nodeWidth + geometry.gap * 2} y1={period.y - geometry.gap / 2} x2={graph.width - geometry.gap} y2={period.y - geometry.gap / 2} />)}{graph.lanes?.map((lane) => <line key={lane.id} x1={lane.x - geometry.gap / 2} y1={lane.y} x2={lane.x - geometry.gap / 2} y2={lane.bottom} />)}</g><FamilyConnections families={families} people={byId} />{relationships.filter((edge) => edge.type !== 'parent').map((edge) => {
          const from = byId.get(edge.from), to = byId.get(edge.to); if (!from || !to) return null;
          return <path key={edge.id} d={edgePath(edge, from, to, geometry)} className={`tree-edge ${edge.type}${edge.kind === 'adoptive' ? ' adoptive' : ''}${edge.status && edge.status !== 'explicit' ? ' inferred' : ''}`}><title>{edge.status ? relationStatusLabels[edge.status] : 'Родственная связь'}</title></path>;
        })}</svg>
        {relationships.filter((edge) => edge.type === 'spouse').map((edge) => {
          const from = byId.get(edge.from), to = byId.get(edge.to); if (!from || !to) return null;
          const position = marriageMarkerPosition(from, to, geometry);
          const inferred = !!edge.status && edge.status !== 'explicit';
          const label = `${inferred ? 'Предполагаемые супруги' : 'Супруги'}: ${from.name} и ${to.name}${inferred ? ` · ${relationStatusLabels[edge.status!]}` : ''}`;
          return <span key={edge.id} className={`tree-marriage${inferred ? ' inferred' : ''}`} style={{ left: position.x, top: position.y }} role="img" aria-label={label} title={label}><MarriageIcon /></span>;
        })}
        {graph.nodes.map((p) => <article className={`tree-node${selected === p.id ? ' is-selected' : ''}${focusPersonId === p.id ? ' is-focus-person' : ''}`} key={p.id} data-branch={branchByPerson.get(p.id)?.id} title={branchByPerson.get(p.id)?.label} style={{ left: p.x, top: p.y }}>
          <a className="tree-node-main" href={p.href} onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) focusPerson(p.id); }}><span className="tree-node-name">{p.name}</span><span className="tree-node-life">{p.lifespan}</span>{p.uncertain && <span className="tree-node-uncertainty">Дата требует уточнения</span>}<span className="tree-node-arrow" aria-hidden="true">↗</span></a>
          {p.id === focusPersonId && <span className="tree-node-you">Вы</span>}
          {relatives[p.id]?.length > 0 && <button type="button" className="tree-relatives-button" aria-haspopup="dialog" aria-label={`Родственники: ${p.name}`} onClick={() => setRelativePerson(p)}>Родственники · {new Set(relatives[p.id].flatMap((group) => group.people.map((person) => person.id))).size}</button>}
        </article>)}
      </div> : <div className="tree-static-register">{people.map((p) => <article key={p.id} data-branch={branchByPerson.get(p.id)?.id} title={branchByPerson.get(p.id)?.label}><a href={p.href}><span>{p.name}</span><small>{p.lifespan}</small></a>{p.id === focusPersonId && <span className="tree-node-you">Вы</span>}{relatives[p.id]?.length > 0 && <details><summary>Родственники</summary><HiddenRelatives groups={relatives[p.id]} /></details>}</article>)}</div>}
    </div>
    <div className="tree-caption"><p id="tree-instructions">Перетаскивайте поле, используйте + / − или жест двумя пальцами. С клавиатуры: стрелки, + / −, 0. Нажмите на имя, чтобы открыть историю.</p>{relationships.length > 0 && <div className="tree-legend">
      {relationships.some((edge) => edge.type === 'parent') && <span className="legend-parent">Родитель — ребёнок</span>}
      {relationships.some((edge) => edge.type === 'spouse') && <span className="legend-spouse"><MarriageIcon /> Брак</span>}
      {relationships.some((edge) => edge.status && edge.status !== 'explicit') && <span className="legend-inferred">Предполагаемая связь</span>}
      {relationships.some((edge) => edge.type === 'sibling') && <span className="legend-sibling">Братья и сёстры</span>}
      {relationships.some((edge) => edge.type === 'half_sibling') && <span className="legend-half">Неполнородное родство</span>}
      {relationships.some((edge) => edge.type === 'possible_same_person') && <span className="legend-identity">Возможное совпадение</span>}
      {relationships.some((edge) => edge.kind === 'adoptive') && <span className="legend-adoptive">Приёмное родство</span>}
    </div>}</div>
    <dialog ref={relativesDialog} className="tree-relatives-dialog" aria-labelledby="tree-relatives-title" onClose={() => setRelativePerson(null)}>
      <div className="tree-relatives-dialog-header"><h2 id="tree-relatives-title">{relativePerson ? `Родственники — ${relativePerson.name}` : 'Родственники'}</h2><button type="button" className="button" onClick={() => relativesDialog.current?.close()} autoFocus>Закрыть</button></div>
      {relativePerson && <HiddenRelatives groups={relatives[relativePerson.id] ?? []} />}
    </dialog>
  </div>;
}
