package app.noma.notes;

/** Home-screen widget showing tasks (today / upcoming / overdue / list) with quick completion. */
public class NomaTaskWidgetProvider extends NomaBaseWidgetProvider {
    @Override
    protected String kind() {
        return "task";
    }
}
