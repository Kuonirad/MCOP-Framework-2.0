import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import NotFound from "../app/not-found";

describe("NotFound Page", () => {
  it("renders the 404 heading", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: /404/i })).toBeInTheDocument();
  });

  it("renders the specific thematic messaging", () => {
    render(<NotFound />);
    expect(screen.getByText(/Trace Dissolved/i)).toBeInTheDocument();
    expect(
      screen.getByText(/The trace you are following has dissolved/i)
    ).toBeInTheDocument();
  });

  it("contains a link to return home", () => {
    render(<NotFound />);
    const homeLink = screen.getByRole("link", { name: /Return to Source/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute("href", "/");
  });
});
