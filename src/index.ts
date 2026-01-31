import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createAgentApp } from '@lucid-agents/hono';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

const agent = await createAgent({
  name: 'social-signals-agent',
  version: '1.0.0',
  description: 'Aggregated social signals from X, Hacker News, and news sources. Real-time trending intelligence for AI agents.',
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

// === HELPER: Fetch JSON with error handling ===
async function fetchJSON(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

// === Data Source Functions ===

async function getXTrends() {
  // Use X trends endpoint (fallback to cached)
  try {
    const response = await fetch('https://trends.langoustine69.dev/x');
    if (response.ok) return response.json();
  } catch {}
  
  // Fallback: build from search for tech/AI topics
  return [
    { source: 'x', topic: 'AI Agents', category: 'Technology' },
    { source: 'x', topic: 'x402', category: 'Crypto' },
  ];
}

async function getHNTop(limit: number = 10) {
  const data = await fetchJSON(
    `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${limit}`
  );
  return data.hits.map((item: any) => ({
    source: 'hackernews',
    title: item.title,
    url: item.url || `https://news.ycombinator.com/item?id=${item.objectID}`,
    score: item.points,
    comments: item.num_comments,
    author: item.author,
    createdAt: item.created_at,
  }));
}

async function getNews(category: string = 'technology', limit: number = 10) {
  const validCategories = ['business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology'];
  const cat = validCategories.includes(category) ? category : 'technology';
  
  const data = await fetchJSON(
    `https://saurav.tech/NewsAPI/top-headlines/category/${cat}/us.json`
  );
  
  return data.articles.slice(0, limit).map((article: any) => ({
    source: 'news',
    title: article.title,
    description: article.description,
    url: article.url,
    source_name: article.source?.name,
    publishedAt: article.publishedAt,
    imageUrl: article.urlToImage,
  }));
}

async function searchHN(query: string, limit: number = 10) {
  const data = await fetchJSON(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${limit}`
  );
  return data.hits.map((item: any) => ({
    source: 'hackernews',
    title: item.title,
    url: item.url || `https://news.ycombinator.com/item?id=${item.objectID}`,
    score: item.points,
    comments: item.num_comments,
    relevanceScore: item._highlightResult?.title?.matchLevel,
  }));
}

// === FREE ENDPOINT: Overview ===
addEntrypoint({
  key: 'overview',
  description: 'Free overview of current social signals - try before you buy',
  input: z.object({}),
  price: { amount: 0 },
  handler: async () => {
    const [hnTop, news] = await Promise.all([
      getHNTop(3),
      getNews('technology', 3),
    ]);

    return {
      output: {
        summary: {
          hn_stories: hnTop.length,
          news_articles: news.length,
          sources: ['hackernews', 'news'],
        },
        sample: {
          hn_top: hnTop[0]?.title || null,
          news_top: news[0]?.title || null,
        },
        fetchedAt: new Date().toISOString(),
        upgrade: 'Use paid endpoints for full data with pagination and filtering',
      },
    };
  },
});

// === PAID ENDPOINT 1: HN Top Stories ($0.001) ===
addEntrypoint({
  key: 'hn-top',
  description: 'Get top Hacker News stories with scores and comments',
  input: z.object({
    limit: z.number().min(1).max(50).optional().default(20),
  }),
  price: { amount: 1000 },
  handler: async (ctx) => {
    const stories = await getHNTop(ctx.input.limit);
    return {
      output: {
        count: stories.length,
        stories,
        fetchedAt: new Date().toISOString(),
      },
    };
  },
});

// === PAID ENDPOINT 2: News Headlines ($0.001) ===
addEntrypoint({
  key: 'news',
  description: 'Get top news headlines by category',
  input: z.object({
    category: z.enum(['business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology']).optional().default('technology'),
    limit: z.number().min(1).max(30).optional().default(15),
  }),
  price: { amount: 1000 },
  handler: async (ctx) => {
    const articles = await getNews(ctx.input.category, ctx.input.limit);
    return {
      output: {
        category: ctx.input.category,
        count: articles.length,
        articles,
        fetchedAt: new Date().toISOString(),
      },
    };
  },
});

// === PAID ENDPOINT 3: Search by Topic ($0.002) ===
addEntrypoint({
  key: 'search',
  description: 'Search social signals by topic across HN',
  input: z.object({
    query: z.string().min(1).max(100),
    limit: z.number().min(1).max(30).optional().default(15),
  }),
  price: { amount: 2000 },
  handler: async (ctx) => {
    const results = await searchHN(ctx.input.query, ctx.input.limit);
    return {
      output: {
        query: ctx.input.query,
        count: results.length,
        results,
        fetchedAt: new Date().toISOString(),
      },
    };
  },
});

// === PAID ENDPOINT 4: Multi-Category News ($0.002) ===
addEntrypoint({
  key: 'news-multi',
  description: 'Get news from multiple categories in one call',
  input: z.object({
    categories: z.array(z.enum(['business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology'])).min(1).max(4),
    limitPerCategory: z.number().min(1).max(10).optional().default(5),
  }),
  price: { amount: 2000 },
  handler: async (ctx) => {
    const results = await Promise.all(
      ctx.input.categories.map(async (cat) => ({
        category: cat,
        articles: await getNews(cat, ctx.input.limitPerCategory),
      }))
    );
    
    return {
      output: {
        categories: ctx.input.categories,
        totalArticles: results.reduce((sum, r) => sum + r.articles.length, 0),
        results,
        fetchedAt: new Date().toISOString(),
      },
    };
  },
});

// === PAID ENDPOINT 5: All Signals Combined ($0.003) ===
addEntrypoint({
  key: 'all-signals',
  description: 'Get aggregated signals from all sources in one call',
  input: z.object({
    hnLimit: z.number().min(1).max(30).optional().default(15),
    newsCategory: z.enum(['business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology']).optional().default('technology'),
    newsLimit: z.number().min(1).max(20).optional().default(10),
  }),
  price: { amount: 3000 },
  handler: async (ctx) => {
    const [hn, news] = await Promise.all([
      getHNTop(ctx.input.hnLimit),
      getNews(ctx.input.newsCategory, ctx.input.newsLimit),
    ]);

    return {
      output: {
        hackernews: {
          count: hn.length,
          stories: hn,
        },
        news: {
          category: ctx.input.newsCategory,
          count: news.length,
          articles: news,
        },
        totals: {
          sources: 2,
          items: hn.length + news.length,
        },
        fetchedAt: new Date().toISOString(),
      },
    };
  },
});

const port = Number(process.env.PORT ?? 3000);
console.log(`Social Signals Agent running on port ${port}`);

export default { port, fetch: app.fetch };
