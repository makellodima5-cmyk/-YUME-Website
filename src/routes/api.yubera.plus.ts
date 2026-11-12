import { createFileRoute } from "@tanstack/react-router";
import { handleYuberaPlus } from "@/data/yubera-plus.server";
export const Route = createFileRoute("/api/yubera/plus")({server:{handlers:{GET:({request})=>handleYuberaPlus(request),POST:({request})=>handleYuberaPlus(request)}}});
