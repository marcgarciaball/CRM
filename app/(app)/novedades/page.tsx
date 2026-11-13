import type { Metadata } from "next";
import Link from "next/link";
import { markNoticesSeenAction } from "@/app/actions/work";
import { ActionButton } from "@/components/action-form";
import { describeActivity } from "@/components/discussion";
import { Empty, PageHeader } from "@/components/ui";
import { formatInstant } from "@/lib/dates";
import { personName } from "@/lib/labels";
import { load } from "@/lib/load";
import { clientPath, deliverablePath, taskPath } from "@/lib/paths";
import { listNotices, type Notice } from "@/lib/services/inbox";

export const metadata: Metadata = { title: "Novedades" };

function text(n: Notice): string {
  const who = personName(n.actor_id, n.actor, "Alguien");
  if (n.action === "comment") return `${who} comentó: «${n.detail.body}»`;
  if (n.type === "task" && n.action === "created") return `${who} te asignó esta tarea`;
  if (n.action === "assignee") return `${who} te asignó esta tarea`;
  if (n.type === "deliverable" && n.action === "status" && n.detail.to === "in_review") return `${who} pide revisión`;
  return `${who} ${describeActivity({ id: "", action: n.action, detail: n.detail, created_at: n.created_at, actor_id: n.actor_id, actor_name: n.actor }, n.type, new Map())}`;
}

export default async function NoticesPage() {
  // Novedades de todos los clientes de la persona; cada una indica su cliente.
  const { notices } = await load(async (q, user) => ({ notices: await listNotices(q, user.id) }));
  const unread = notices.filter((n) => n.unread).length;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Novedades" actions={unread > 0 && <ActionButton action={markNoticesSeenAction} fields={{}} className="btn btn-secondary">Marcar todo como leído</ActionButton>}>
        <p className="mt-1 text-sm text-muted">Lo que otras personas han hecho en tu trabajo en los últimos 30 días{unread > 0 && <>: <span className="font-mono">{unread}</span> sin leer</>}.</p>
      </PageHeader>
      <div className="border-y border-ink">
        {notices.length === 0 ? <div className="py-2"><Empty>Sin novedades.</Empty></div> : (
          <ul>
            {notices.map((n, i) => (
              <li key={i} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
                <span className={`mt-1.5 size-2 shrink-0 rounded-[50%] ${n.unread ? "bg-accent" : "bg-transparent"}`} aria-hidden />
                <div className="min-w-0">
                  <Link href={(n.type === "task" ? taskPath : deliverablePath)(n)} className={`hover:underline ${n.unread ? "font-semibold" : "font-medium"}`}>{n.title}</Link>
                  {n.unread && <span className="sr-only"> (sin leer)</span>}
                  <p className="text-sm break-words">{text(n)}</p>
                  <p className="text-xs text-muted"><Link href={clientPath(n.client_id)} className="hover:underline">{n.client_name}</Link> · <span className="font-mono">{formatInstant(n.created_at)}</span></p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
