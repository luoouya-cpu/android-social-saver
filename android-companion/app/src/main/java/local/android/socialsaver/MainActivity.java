package local.android.socialsaver;

import android.app.Activity;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

public class MainActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        String shared = getIntent().getStringExtra(Intent.EXTRA_TEXT);
        if (shared == null) shared = "";
        Intent openObsidian = new Intent(Intent.ACTION_VIEW,
                Uri.parse("obsidian://save-social?url=" + Uri.encode(shared)));
        try {
            startActivity(openObsidian);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "请先安装并打开 Obsidian", Toast.LENGTH_LONG).show();
        } finally {
            finish();
        }
    }
}
