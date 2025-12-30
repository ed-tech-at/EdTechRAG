<script>
    import { resolve } from '$app/paths';
  
    let { data, children } = $props();

</script>
<nav>
  <b>EdTechRAG</b> <a href={resolve('/admin/')}>Admin</a> 
  <a href={resolve('/logout/')}>Logout</a> 
</nav>
<div class="page-content">{@render children()}</div>