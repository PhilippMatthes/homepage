# Generated by Django 3.0.8 on 2021-03-06 13:25

from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='BlockchainAddress',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('blockchain', models.TextField()),
                ('address', models.TextField()),
                ('tracking_url', models.TextField(blank=True, null=True)),
            ],
        ),
    ]
