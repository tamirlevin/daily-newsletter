const normalise = (value) => value.trim().toLocaleLowerCase();

const weeklyControls = document.querySelector("[data-controls]");

if (weeklyControls) {
  const search = weeklyControls.querySelector("[data-search]");
  const filters = [...weeklyControls.querySelectorAll("[data-filter]")];
  const stories = [...document.querySelectorAll("[data-story]")];
  const sections = [...document.querySelectorAll("[data-section]")];
  const count = weeklyControls.querySelector("[data-result-count]");
  const empty = document.querySelector("[data-empty]");
  let activeCategory = "all";

  weeklyControls.addEventListener("submit", (event) => event.preventDefault());

  const updateStories = () => {
    const query = normalise(search.value);
    let visibleCount = 0;

    stories.forEach((story) => {
      const matchesCategory =
        activeCategory === "all" || story.dataset.category === activeCategory;
      const matchesQuery = !query || normalise(story.textContent).includes(query);
      const visible = matchesCategory && matchesQuery;
      story.hidden = !visible;
      if (visible) visibleCount += 1;
    });

    sections.forEach((section) => {
      section.hidden = !section.querySelector("[data-story]:not([hidden])");
    });

    count.textContent = `${visibleCount} ${visibleCount === 1 ? "story" : "stories"}`;
    empty.hidden = visibleCount !== 0;
  };

  search.addEventListener("input", updateStories);
  filters.forEach((filter) => {
    filter.addEventListener("click", () => {
      activeCategory = filter.dataset.filter;
      filters.forEach((button) => {
        button.setAttribute("aria-pressed", String(button === filter));
      });
      updateStories();
    });
  });
}

const historyControls = document.querySelector("[data-history-controls]");

if (historyControls) {
  const search = historyControls.querySelector("[data-history-search]");
  const issues = [...document.querySelectorAll("[data-history-issue]")];
  const count = historyControls.querySelector("[data-history-result-count]");
  const empty = document.querySelector("[data-history-empty]");

  historyControls.addEventListener("submit", (event) => event.preventDefault());

  const updateIssues = () => {
    const query = normalise(search.value);
    let visibleCount = 0;

    issues.forEach((issue) => {
      const visible = !query || normalise(issue.dataset.searchText).includes(query);
      issue.hidden = !visible;
      if (visible) visibleCount += 1;
    });

    count.textContent = `${visibleCount} ${visibleCount === 1 ? "issue" : "issues"}`;
    empty.hidden = visibleCount !== 0;
  };

  search.addEventListener("input", updateIssues);
}
