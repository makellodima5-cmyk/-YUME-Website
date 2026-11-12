import { createFileRoute } from "@tanstack/react-router";
import { handleAdminYuberaPlus } from "@/data/yubera-plus.server";
export const Route = createFileRoute("/api/admin/yubera-plus")({server:{handlers:{GET:({request})=>handleAdminYuberaPlus(request),POST:({request})=>handleAdminYuberaPlus(request)}}});
