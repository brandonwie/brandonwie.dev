<!--
  /projects/+page.svelte — Projects index (URL: /projects)

  Thin wrapper. ProjectsPage reuses about.ts systems[]; locale drives EN hrefs +
  canonical.
-->
<script lang="ts">
	import ProjectsPage from '$lib/components/ProjectsPage.svelte';
</script>

<ProjectsPage locale="en" />
