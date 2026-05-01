import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AppState } from '../types';
import { cn } from '../lib/utils';
import {
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  Circle,
  Folder,
  GripVertical,
  LockKeyhole,
  RefreshCw,
  Scale,
  Shield,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  WalletCards,
  Workflow,
  X,
} from 'lucide-react';

interface Props {
  state: AppState;
}

type PieceCategory = 'Goal' | 'Agents' | 'Rules' | 'Payment';

interface WorkflowPiece {
  id: string;
  label: string;
  desc: string;
  category: PieceCategory;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const PIECES: WorkflowPiece[] = [
  { id: 'intent', label: 'User Goal', desc: 'Natural-language mandate', category: 'Goal', icon: Sparkles },
  { id: 'schedule-trigger', label: 'Schedule Trigger', desc: 'Weekly or monthly run', category: 'Goal', icon: CalendarClock },
  { id: 'price-trigger', label: 'Price Trigger', desc: 'ETH move or market event', category: 'Goal', icon: TimerReset },
  { id: 'vault-destination', label: 'Vault Destination', desc: 'Approved recipient only', category: 'Goal', icon: Target },
  { id: 'requester', label: 'Requester Agent', desc: 'Files case and holds escrow', category: 'Agents', icon: Bot, badge: 'Selected' },
  { id: 'worker', label: 'Worker Agent', desc: 'Performs permitted work', category: 'Agents', icon: Bot, badge: 'Score 89' },
  { id: 'jury', label: '3-Verifier Jury', desc: 'AXL quorum verdict (2/3)', category: 'Agents', icon: Scale, badge: 'System' },
  { id: 'trust-filter', label: 'Trust Filter', desc: 'Minimum agent score 80', category: 'Rules', icon: ShieldCheck },
  { id: 'permit-rule', label: 'Permit Rule', desc: 'No action before approval', category: 'Rules', icon: LockKeyhole },
  { id: 'protected-action', label: 'Protected Action', desc: 'Vault deposit or buy action', category: 'Rules', icon: Shield },
  { id: 'payout-rule', label: 'Payout Rule', desc: 'Pay only after proof', category: 'Payment', icon: WalletCards },
  { id: 'max-budget', label: 'Max Budget', desc: 'Caps action and fees', category: 'Payment', icon: WalletCards },
];

const DEFAULT_CHAIN = ['intent', 'schedule-trigger', 'strategy', 'trust-filter', 'executor', 'protected-action', 'permit-rule', 'payout-rule'];
const CATEGORIES: PieceCategory[] = ['Goal', 'Agents', 'Rules', 'Payment'];

const BACKEND_AUTOMATION = [
  { label: '2PC prepare', detail: 'policy + escrow checks' },
  { label: 'AXL transcript', detail: 'agent messages logged' },
  { label: 'KeeperHub execution', detail: 'only approved path' },
  { label: '0G evidence', detail: 'proof bundle stored' },
  { label: 'Proof verification', detail: 'tamper check' },
  { label: 'Payout decision', detail: 'release or block' },
];

export default function WorkflowCanvas({ state }: Props) {
  const [activeCategory, setActiveCategory] = useState<PieceCategory>('Goal');
  const [chainIds, setChainIds] = useState<string[]>(DEFAULT_CHAIN);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);

  const piecesById = useMemo(
    () => Object.fromEntries(PIECES.map((piece) => [piece.id, piece])),
    [],
  );
  const visiblePieces = PIECES.filter((piece) => piece.category === activeCategory);

  const addPiece = (pieceId: string) => {
    setChainIds((current) => current.includes(pieceId) ? current : [...current, pieceId]);
  };

  const removePiece = (pieceId: string) => {
    setChainIds((current) => current.filter((id) => id !== pieceId));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const pieceId = event.dataTransfer.getData('application/proofcourt-piece') || draggingId;
    if (pieceId) {
      addPiece(pieceId);
    }
    setDraggingId(null);
    setIsDropActive(false);
  };

  const getStatus = (id: string, index: number) => {
    const states = [
      'idle',
      'workflow_generated',
      'agents_selected',
      'prepare_running',
      'permit_issued',
      'payout_locked',
      'commit_running',
      'execution_complete',
      'evidence_stored',
      'proof_verified',
      'payout_released',
      'reputation_updated',
    ];
    const currentStateIndex = states.indexOf(state);

    if (state === 'tamper_detected' || state === 'payout_blocked') {
      if (id === 'payout-rule' || id === 'permit-rule' || id === 'judge') return 'error';
    }

    if (currentStateIndex >= index + 2) return 'completed';
    if (currentStateIndex === index + 1) return 'active';
    return 'pending';
  };

  return (
    <div className="rounded-[10px] border-[3px] border-white/80 bg-[#f7f7f2] p-6 text-black shadow-[8px_8px_0_rgba(0,0,0,0.35)]">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Workflow className="h-5 w-5" />
            <h3 className="text-2xl font-black tracking-tight">ProofCourt Builder</h3>
          </div>
          <p className="mt-1 text-sm font-medium text-black/55">
            Drag only the user intent, agents, rules, and payout conditions. ProofCourt handles execution proof automatically.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-md border-2 border-black bg-white px-3 py-2 text-xs font-black uppercase shadow-[3px_3px_0_black]">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Live MVP Graph
        </div>
      </div>

      <div className="rounded-[8px] border-2 border-black bg-white p-5">
        <div className="mb-5 flex items-center justify-between">
            <h4 className="text-xl font-black">User Workflow Pieces</h4>
          <div className="hidden text-xs font-bold text-black/45 md:block">
            Drag a piece into your chain or click a block to add it.
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={cn(
                'flex items-center gap-2 rounded-[8px] border-2 border-black px-4 py-3 text-left text-sm font-black transition-transform hover:-translate-y-0.5',
                activeCategory === category
                  ? 'bg-black text-white shadow-[4px_4px_0_#FF0B0B]'
                  : 'bg-white text-black shadow-[3px_3px_0_rgba(0,0,0,0.75)]',
              )}
            >
              <Folder className="h-4 w-4" />
              {category}
            </button>
          ))}
        </div>

        <div className="relative rounded-[8px] border-2 border-black bg-[#fbfbf7] p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {visiblePieces.map((piece) => (
              <PieceCard
                key={piece.id}
                piece={piece}
                active={draggingId === piece.id}
                onAdd={() => addPiece(piece.id)}
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/proofcourt-piece', piece.id);
                  setDraggingId(piece.id);
                }}
                onDragEnd={() => setDraggingId(null)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[8px] border-[3px] border-black bg-white p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h4 className="text-xl font-black">Your Agent Chain</h4>
            <p className="text-sm font-medium text-black/50">
              This is what the user configures. Sponsor integrations run after the chain starts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setChainIds(DEFAULT_CHAIN)}
            className="flex items-center gap-2 rounded-md border-2 border-black bg-white px-3 py-2 text-xs font-black uppercase shadow-[3px_3px_0_black] transition-transform hover:-translate-y-0.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset Chain
          </button>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDropActive(true);
          }}
          onDragLeave={() => setIsDropActive(false)}
          className={cn(
            'min-h-[220px] rounded-[8px] border-2 border-dashed p-5 transition-colors',
            isDropActive ? 'border-primary bg-primary/10' : 'border-black/35 bg-[#f7f7f2]',
          )}
        >
          {chainIds.length === 0 ? (
            <div className="flex h-[170px] items-center justify-center text-sm font-bold text-black/35">
              Drag blocks here to build your ProofCourt chain
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              {chainIds.map((pieceId, index) => {
                const piece = piecesById[pieceId];
                if (!piece) return null;
                const status = getStatus(piece.id, index);

                return (
                  <ChainBlock
                    key={`${piece.id}-${index}`}
                    piece={piece}
                    status={status}
                    index={index}
                    isLast={index === chainIds.length - 1}
                    onRemove={() => removePiece(piece.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-[8px] border-[3px] border-black bg-black p-5 text-white shadow-[5px_5px_0_#FF0B0B]">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h4 className="text-xl font-black">Automatic Backend Run</h4>
            </div>
            <p className="mt-1 text-sm font-medium text-white/55">
              These are not draggable blocks. They happen automatically after the user starts the agent chain.
            </p>
          </div>
          <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/60">
            Permit + Proof Engine
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          {BACKEND_AUTOMATION.map((step, index) => (
            <div
              key={step.label}
              className="relative rounded-[8px] border border-white/15 bg-white/[0.06] p-3"
            >
              {index < BACKEND_AUTOMATION.length - 1 && (
                <div className="pointer-events-none absolute left-[calc(100%-3px)] top-1/2 hidden h-px w-4 bg-white/25 md:block" />
              )}
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-black text-white">
                {index + 1}
              </div>
              <div className="text-xs font-black uppercase tracking-tight">{step.label}</div>
              <div className="mt-1 text-[11px] font-semibold leading-snug text-white/40">{step.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PieceCard({
  piece,
  active,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  key?: React.Key;
  piece: WorkflowPiece;
  active: boolean;
  onAdd: () => void;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}) {
  const Icon = piece.icon;

  return (
    <button
      type="button"
      draggable
      onClick={onAdd}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'group min-h-[132px] rounded-[18px] border-[3px] border-black bg-white p-4 text-center shadow-[5px_5px_0_black] transition-all hover:-translate-y-1 hover:shadow-[7px_7px_0_black]',
        active && 'scale-95 opacity-60',
      )}
    >
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-black text-white">
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm font-black">{piece.label}</div>
      <div className="mt-1 text-xs font-semibold text-black/45">{piece.desc}</div>
      {piece.badge && (
        <div className="mt-3 inline-flex rounded-full bg-primary px-2 py-1 text-[10px] font-black uppercase text-white">
          {piece.badge}
        </div>
      )}
    </button>
  );
}

function ChainBlock({
  piece,
  status,
  index,
  isLast,
  onRemove,
}: {
  key?: React.Key;
  piece: WorkflowPiece;
  status: string;
  index: number;
  isLast: boolean;
  onRemove: () => void;
}) {
  const Icon = piece.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
    >
      {!isLast && (
        <div className="pointer-events-none absolute left-[calc(100%-8px)] top-1/2 z-10 hidden -translate-y-1/2 items-center md:flex">
          <div className="h-[3px] w-8 bg-black" />
          <ArrowRight className="h-5 w-5 text-black" />
        </div>
      )}

      <div
        className={cn(
          'min-h-[150px] rounded-[18px] border-[3px] border-black bg-white p-4 shadow-[5px_5px_0_black]',
          status === 'completed' && 'bg-green-50',
          status === 'active' && 'bg-red-50 ring-4 ring-primary/20',
          status === 'error' && 'bg-red-100',
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase text-black/45">
            <GripVertical className="h-4 w-4" />
            Step {index + 1}
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full border-2 border-black bg-white p-1 transition-colors hover:bg-black hover:text-white"
            aria-label={`Remove ${piece.label}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black text-white">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-black">{piece.label}</div>
            <div className="mt-1 text-xs font-semibold text-black/50">{piece.desc}</div>
            {piece.badge && (
              <div className="mt-2 inline-flex rounded-full border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase">
                {piece.badge}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t-2 border-black/10 pt-3 text-[10px] font-black uppercase">
          {status === 'completed' ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Verified
            </>
          ) : status === 'active' ? (
            <>
              <Circle className="h-4 w-4 fill-primary text-primary" />
              Running
            </>
          ) : status === 'error' ? (
            <>
              <Circle className="h-4 w-4 fill-red-600 text-red-600" />
              Blocked
            </>
          ) : (
            <>
              <Circle className="h-4 w-4 text-black/20" />
              Waiting
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
