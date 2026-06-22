<!--
  /ko/projects/+page.svelte — Korean Projects index (URL: /ko/projects)

  Thin wrapper. ProjectsPage reads the Korean systems[] from about.ts — real KO
  parity, no fallback banner needed (copy is already reviewed + shipped).
-->
<script lang="ts">
	import ProjectsPage from '$lib/components/ProjectsPage.svelte';
</script>

<ProjectsPage locale="ko" />
