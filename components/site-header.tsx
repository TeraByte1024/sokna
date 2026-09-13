import { Suspense } from "react";
import { AuthButton } from "@/components/auth-button";
import { SiteHeaderClient } from "@/components/site-header-client";

export function SiteHeader() {
	return (
		<SiteHeaderClient
			authButton={
				<Suspense fallback={<div className="h-8 w-20" />}>
					<AuthButton />
				</Suspense>
			}
		/>
	);
}
